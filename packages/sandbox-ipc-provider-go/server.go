package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"sandbox-ipc-provider-go/fs"
	"sandbox-ipc-provider-go/types"
)

// Message types for WebSocket protocol
const (
	// Request/Response
	MsgTypeRequest  = "request"
	MsgTypeResponse = "response"
	MsgTypeError    = "error"

	// Server-initiated events
	MsgTypeEvent = "event"
)

// Request represents an incoming WebSocket request
type Request struct {
	ID     uint64          `json:"id"`
	Method string          `json:"method"`
	Params json.RawMessage `json:"params,omitempty"`
}

// Response represents an outgoing WebSocket response
type Response struct {
	ID     uint64      `json:"id"`
	Result interface{} `json:"result,omitempty"`
	Error  *ErrorInfo  `json:"error,omitempty"`
}

// ErrorInfo contains error details
type ErrorInfo struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Event represents a server-initiated event
type Event struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// WebSocketMessage is the envelope for all messages
type WebSocketMessage struct {
	Type   string      `json:"type"` // "request", "response", "error", "event"
	ID     uint64      `json:"id,omitempty"`
	Method string      `json:"method,omitempty"`
	Params interface{} `json:"params,omitempty"`
	Result interface{} `json:"result,omitempty"`
	Error  *ErrorInfo  `json:"error,omitempty"`
	Event  string      `json:"event,omitempty"`
	Data   interface{} `json:"data,omitempty"`
}

// Client represents a connected WebSocket client
type Client struct {
	conn *websocket.Conn
	ctx  context.Context
}

// Server is the WebSocket server for filesystem operations
type Server struct {
	provider   *fs.Provider
	watcher    *fs.Watcher
	cache      *fs.DirectoryCache
	prefetcher *fs.Prefetcher
	verifier   *fs.CacheVerifier

	// WebSocket clients
	clients map[*Client]bool
	mu      sync.RWMutex
}

// NewServer creates a new WebSocket server
func NewServer(workspacePath string) (*Server, error) {
	provider, err := fs.NewProvider(workspacePath)
	if err != nil {
		return nil, err
	}

	cache := fs.NewDirectoryCache(500)
	
	s := &Server{
		provider:   provider,
		cache:      cache,
		prefetcher: fs.NewPrefetcher(provider, cache),
		verifier:   fs.NewCacheVerifier(provider, cache),
		clients:    make(map[*Client]bool),
	}

	// Set up cache verification callback to emit events
	s.verifier.SetStaleCallback(func(path string, entries []types.DirectoryEntry) {
		// Emit directoryChanged event when cache becomes stale
		s.broadcastEvent("directoryChanged", map[string]interface{}{
			"path":    path,
			"entries": entries,
		})
	})

	// Create watcher with server as event handler
	w, err := fs.NewWatcher(workspacePath, s)
	if err != nil {
		return nil, err
	}
	s.watcher = w

	return s, nil
}

// Start begins the server and file watcher
func (s *Server) Start(addr string) error {
	// Start file watcher
	if err := s.watcher.Start(); err != nil {
		return err
	}

	// Setup HTTP handlers
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/health", s.handleHealth)

	fmt.Printf("🚀 Sandbox IPC server running at ws://%s/ws\n", addr)
	fmt.Printf("📁 Workspace: %s\n", s.provider.CWD())
	fmt.Println("\nWebSocket Methods:")
	fmt.Println("  fs.readDirectory  - List directory contents")
	fmt.Println("  fs.stat           - Get file/directory metadata")
	fmt.Println("  fs.readFile       - Read file contents (base64)")
	fmt.Println("  fs.writeFile      - Write file contents")
	fmt.Println("  fs.createDirectory - Create directory")
	fmt.Println("  fs.delete         - Delete file/directory")
	fmt.Println("  fs.rename         - Rename/move file")
	fmt.Println("  fs.exists         - Check if path exists")
	fmt.Println("\nEvents pushed to clients:")
	fmt.Println("  fileCreated, fileChanged, fileDeleted, fileRenamed")
	fmt.Println("  directoryChanged")
	fmt.Println("\nPress Ctrl+C to stop\n")

	return http.ListenAndServe(addr, mux)
}

// Stop shuts down the server
func (s *Server) Stop() error {
	s.mu.Lock()
	for client := range s.clients {
		client.conn.Close(websocket.StatusGoingAway, "server shutdown")
	}
	s.mu.Unlock()
	return s.watcher.Stop()
}

// handleWebSocket handles WebSocket connections
func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true, // Allow all origins
	})
	if err != nil {
		log.Printf("WebSocket accept error: %v", err)
		return
	}

	ctx := r.Context()
	client := &Client{conn: conn, ctx: ctx}

	// Register client
	s.mu.Lock()
	s.clients[client] = true
	s.mu.Unlock()

	// Send connected event
	s.sendEvent(client, "connected", map[string]interface{}{
		"workspace": s.provider.CWD(),
	})

	// Handle messages
	s.handleConnection(client)
}

// handleConnection processes messages from a WebSocket connection
func (s *Server) handleConnection(client *Client) {
	defer func() {
		s.mu.Lock()
		delete(s.clients, client)
		s.mu.Unlock()
		client.conn.CloseNow()
	}()

	for {
		// Read with timeout context
		ctx, cancel := context.WithTimeout(client.ctx, 60*time.Second)
		_, data, err := client.conn.Read(ctx)
		cancel()

		if err != nil {
			if websocket.CloseStatus(err) == websocket.StatusNormalClosure ||
				websocket.CloseStatus(err) == websocket.StatusGoingAway {
				return
			}
			// Check for context cancellation (client disconnect)
			if client.ctx.Err() != nil {
				return
			}
			// Timeout is ok, continue reading
			if err == context.DeadlineExceeded {
				continue
			}
			log.Printf("WebSocket read error: %v", err)
			return
		}

		// Parse request
		var req Request
		if err := json.Unmarshal(data, &req); err != nil {
			s.sendError(client, 0, -32700, "Parse error")
			continue
		}

		// Handle request
		s.handleRequest(client, &req)
	}
}

// handleRequest dispatches a request to the appropriate handler
func (s *Server) handleRequest(client *Client, req *Request) {
	var result interface{}
	var err error

	switch req.Method {
	case "fs.readDirectory":
		result, err = s.handleReadDirectory(req.Params)
	case "fs.stat":
		result, err = s.handleStat(req.Params)
	case "fs.readFile":
		result, err = s.handleReadFile(req.Params)
	case "fs.writeFile":
		result, err = s.handleWriteFile(req.Params)
	case "fs.createDirectory":
		result, err = s.handleCreateDirectory(req.Params)
	case "fs.delete":
		result, err = s.handleDelete(req.Params)
	case "fs.rename":
		result, err = s.handleRename(req.Params)
	case "fs.exists":
		result, err = s.handleExists(req.Params)
	default:
		s.sendError(client, req.ID, -32601, fmt.Sprintf("Method not found: %s", req.Method))
		return
	}

	if err != nil {
		s.sendError(client, req.ID, -32000, err.Error())
		return
	}

	s.sendResponse(client, req.ID, result)
}

// Parameter types for each method
type PathParams struct {
	Path string `json:"path"`
}

type WriteFileParams struct {
	Path    string `json:"path"`
	Content string `json:"content"` // base64 encoded
}

type DeleteParams struct {
	Path      string `json:"path"`
	Recursive bool   `json:"recursive"`
}

type RenameParams struct {
	OldPath string `json:"oldPath"`
	NewPath string `json:"newPath"`
}

// Handler implementations

func (s *Server) handleReadDirectory(params json.RawMessage) (interface{}, error) {
	var p PathParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	path := p.Path
	if path == "" {
		path = s.provider.CWD()
	}

	// Check cache first
	if cached := s.cache.Get(path); cached != nil {
		// Schedule cache verification in background
		s.verifier.ScheduleVerify(path)
		// Prefetch child directories in background
		go s.prefetcher.PrefetchChildren(path, cached.Entries)
		return map[string]interface{}{"entries": cached.Entries}, nil
	}

	entries, err := s.provider.ReadDirectory(path)
	if err != nil {
		return nil, err
	}

	// Cache the result
	s.cache.Set(path, entries)

	// Prefetch child directories in background
	go s.prefetcher.PrefetchChildren(path, entries)

	return map[string]interface{}{"entries": entries}, nil
}

func (s *Server) handleStat(params json.RawMessage) (interface{}, error) {
	var p PathParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	return s.provider.Stat(p.Path)
}

func (s *Server) handleReadFile(params json.RawMessage) (interface{}, error) {
	var p PathParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	content, err := s.provider.ReadFile(p.Path)
	if err != nil {
		return nil, err
	}

	// Return as base64 for safe JSON transport
	return map[string]interface{}{
		"content": content, // Will be base64 encoded by json.Marshal for []byte
	}, nil
}

func (s *Server) handleWriteFile(params json.RawMessage) (interface{}, error) {
	var p WriteFileParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	// Content comes as base64, decode it
	content := []byte(p.Content)

	if err := s.provider.WriteFile(p.Path, content); err != nil {
		return nil, err
	}

	return map[string]bool{"success": true}, nil
}

func (s *Server) handleCreateDirectory(params json.RawMessage) (interface{}, error) {
	var p PathParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	if err := s.provider.CreateDirectory(p.Path); err != nil {
		return nil, err
	}

	return map[string]bool{"success": true}, nil
}

func (s *Server) handleDelete(params json.RawMessage) (interface{}, error) {
	var p DeleteParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	if err := s.provider.Delete(p.Path, &types.DeleteOptions{Recursive: p.Recursive}); err != nil {
		return nil, err
	}

	return map[string]bool{"success": true}, nil
}

func (s *Server) handleRename(params json.RawMessage) (interface{}, error) {
	var p RenameParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	if err := s.provider.Rename(p.OldPath, p.NewPath); err != nil {
		return nil, err
	}

	return map[string]bool{"success": true}, nil
}

func (s *Server) handleExists(params json.RawMessage) (interface{}, error) {
	var p PathParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	return map[string]bool{"exists": s.provider.Exists(p.Path)}, nil
}

// sendResponse sends a successful response
func (s *Server) sendResponse(client *Client, id uint64, result interface{}) {
	msg := WebSocketMessage{
		Type:   MsgTypeResponse,
		ID:     id,
		Result: result,
	}
	s.sendJSON(client, msg)
}

// sendError sends an error response
func (s *Server) sendError(client *Client, id uint64, code int, message string) {
	msg := WebSocketMessage{
		Type: MsgTypeError,
		ID:   id,
		Error: &ErrorInfo{
			Code:    code,
			Message: message,
		},
	}
	s.sendJSON(client, msg)
}

// sendEvent sends an event to a specific connection
func (s *Server) sendEvent(client *Client, eventType string, data interface{}) {
	msg := WebSocketMessage{
		Type:  MsgTypeEvent,
		Event: eventType,
		Data:  data,
	}
	s.sendJSON(client, msg)
}

// broadcastEvent sends an event to all connected clients
func (s *Server) broadcastEvent(eventType string, data interface{}) {
	msg := WebSocketMessage{
		Type:  MsgTypeEvent,
		Event: eventType,
		Data:  data,
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	for client := range s.clients {
		s.sendJSON(client, msg)
	}
}

// sendJSON sends a JSON message over WebSocket
// coder/websocket supports concurrent writes, no mutex needed
func (s *Server) sendJSON(client *Client, v interface{}) {
	ctx, cancel := context.WithTimeout(client.ctx, 5*time.Second)
	defer cancel()

	if err := wsjson.Write(ctx, client.conn, v); err != nil {
		log.Printf("WebSocket write error: %v", err)
	}
}

// handleHealth handles health check requests (still HTTP for container probes)
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "ok",
		"workspace": s.provider.CWD(),
		"watching":  s.watcher.IsWatching(),
		"clients":   len(s.clients),
	})
}

// EventHandler implementation - these are called by the watcher

func (s *Server) OnCreated(event types.FileCreatedEvent) {
	s.broadcastEvent("fileCreated", event)

	// Also send directoryChanged for parent
	s.emitDirectoryChanged(event.Path)
}

func (s *Server) OnModified(event types.FileContentChangedEvent) {
	s.broadcastEvent("fileChanged", event)
}

func (s *Server) OnDeleted(event types.FileDeletedEvent) {
	s.cache.Delete(event.Path)
	s.broadcastEvent("fileDeleted", event)

	// Also send directoryChanged for parent
	s.emitDirectoryChanged(event.Path)
}

func (s *Server) OnRenamed(event types.FileRenamedEvent) {
	s.cache.Delete(event.OldPath)
	s.broadcastEvent("fileRenamed", event)

	// Send directoryChanged for both old and new parent directories
	s.emitDirectoryChanged(event.OldPath)
	s.emitDirectoryChanged(event.NewPath)
}

// emitDirectoryChanged refreshes and broadcasts directory listing
func (s *Server) emitDirectoryChanged(filePath string) {
	// Get parent directory
	parentDir := filepath.Dir(filePath)

	// Refresh the directory listing
	entries, err := s.provider.ReadDirectory(parentDir)
	if err != nil {
		return
	}

	// Update cache
	s.cache.Set(parentDir, entries)

	// Broadcast the change
	s.broadcastEvent("directoryChanged", types.DirectoryListingChangedEvent{
		Path:    parentDir,
		Entries: entries,
	})
}
