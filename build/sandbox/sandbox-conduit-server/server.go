package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"sync"
	"time"

	"sandbox-conduit-server/git"
	"sandbox-conduit-server/types"
	"sandbox-conduit-server/session"

	"github.com/gorilla/websocket"
)

// Message types for WebSocket protocol
const (
	MsgTypeRequest  = "request"
	MsgTypeResponse = "response"
	MsgTypeError    = "error"
	MsgTypeEvent    = "event"
)

// Request represents an incoming WebSocket request
type Request struct {
	ID     uint64          `json:"id"`
	Method string          `json:"method"`
	Params json.RawMessage `json:"params,omitempty"`
}

// ErrorInfo contains error details
type ErrorInfo struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// WebSocketMessage is the envelope for all messages
type WebSocketMessage struct {
	Type   string      `json:"type"`
	ID     uint64      `json:"id,omitempty"`
	Method string      `json:"method,omitempty"`
	Params interface{} `json:"params,omitempty"`
	Result interface{} `json:"result,omitempty"`
	Error  *ErrorInfo  `json:"error,omitempty"`
	Event  string      `json:"event,omitempty"`
	Data   interface{} `json:"data,omitempty"`
}

// WebSocket upgrader with permissive settings for cross-origin connections
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins
	},
}

// Client represents a connected WebSocket client with its workspace session
type Client struct {
	conn      *websocket.Conn
	ctx       context.Context
	cancel    context.CancelFunc
	session   *session.Session
	release   func() // Release the workspace session
	writeMu   sync.Mutex // Protects writes to the connection
	lastPong  time.Time  // Tracks last pong receipt for keepalive monitoring
	mu        sync.Mutex
}

// Server is the WebSocket server that manages per-client workspace sessions
type Server struct {
	manager          *session.Manager
	defaultWorkspace string // Default workspace if client doesn't specify one
	clients          map[*Client]bool
	chunkManager     *git.ChunkedPatchManager // Manages chunked patch sessions
	mu               sync.RWMutex
}

// NewServer creates a new server with workspace manager
func NewServer(defaultWorkspace string) *Server {
	return &Server{
		manager:          session.NewManager(),
		defaultWorkspace: defaultWorkspace,
		clients:          make(map[*Client]bool),
		chunkManager:     git.NewChunkedPatchManager(),
	}
}

// Start begins the HTTP/WebSocket server
func (s *Server) Start(addr string) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/health", s.handleHealth)

	fmt.Printf("🚀 Sandbox IPC server running at ws://%s/ws\n", addr)
	fmt.Printf("📁 Default workspace: %s\n", s.defaultWorkspace)
	fmt.Println("\nClients can specify workspace via query param: /ws?workspace=/path/to/dir")
	fmt.Println("\nWebSocket Methods:")
	fmt.Println("  fs.readDirectory, fs.stat, fs.readFile, fs.writeFile")
	fmt.Println("  fs.createDirectory, fs.delete, fs.rename, fs.exists")
	fmt.Println("  git.status, git.branch, git.branches, git.diff, git.fileAtRef")
	fmt.Println("  git.stage, git.unstage, git.commit, git.checkout, git.revert")
	fmt.Println("\nEvents: fileCreated, fileChanged, fileDeleted, fileRenamed,")
	fmt.Println("        directoryChanged, gitStatusChanged, gitBranchChanged")
	fmt.Println("\nPress Ctrl+C to stop\n")

	return http.ListenAndServe(addr, mux)
}

// Stop shuts down the server
func (s *Server) Stop() {
	s.mu.Lock()
	for client := range s.clients {
		client.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseGoingAway, "server shutdown"))
		client.conn.Close()
		if client.release != nil {
			client.release()
		}
	}
	s.mu.Unlock()
}

// handleWebSocket handles new WebSocket connections
func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	// Increase read limit to handle large patch messages (default is 32KB)
	// We need to support patches up to several MB
	conn.SetReadLimit(10 * 1024 * 1024) // 10MB

	// Get workspace from query param, default to server default
	workspacePath := r.URL.Query().Get("workspace")
	if workspacePath == "" {
		workspacePath = s.defaultWorkspace
	}

	ctx, cancel := context.WithCancel(r.Context())
	client := &Client{
		conn:   conn,
		ctx:    ctx,
		cancel: cancel,
	}

	// Create event handler for this client
	handler := &clientEventHandler{client: client, server: s}

	// Acquire workspace session
	session, release, err := s.manager.Acquire(workspacePath, client, handler)
	if err != nil {
		log.Printf("Failed to acquire workspace session: %v", err)
		s.sendEvent(client, "error", map[string]string{
			"message": fmt.Sprintf("Failed to open workspace: %v", err),
		})
		conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "workspace error"))
		conn.Close()
		return
	}

	client.session = session
	client.release = release

	// Register client
	s.mu.Lock()
	s.clients[client] = true
	s.mu.Unlock()

	// Send connected event
	s.sendEvent(client, "connected", map[string]interface{}{
		"workspace":    session.WorkspacePath,
		"watcherReady": session.Watcher.IsReady(),
		"hasGit":       session.GitProvider != nil,
	})

	// Start ping loop to keep connection alive
	go s.pingLoop(client)

	// Handle messages (blocks until disconnect)
	s.handleConnection(client)
}

// pingLoop sends periodic pings to keep the WebSocket connection alive.
// This prevents proxies and load balancers from closing idle connections.
// Pongs are received asynchronously via SetPongHandler in handleConnection.
func (s *Server) pingLoop(client *Client) {
	const pingInterval = 15 * time.Second
	const pongTimeout = 45 * time.Second // Allow 3 ping cycles before considering connection dead

	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()

	// Initialize lastPong to now so we don't immediately fail
	client.mu.Lock()
	client.lastPong = time.Now()
	client.mu.Unlock()

	for {
		select {
		case <-client.ctx.Done():
			return
		case <-ticker.C:
			// Check if we've received a pong recently
			client.mu.Lock()
			pongAge := time.Since(client.lastPong)
			client.mu.Unlock()

			if pongAge > pongTimeout {
				log.Printf("No pong received in %v, closing connection", pongAge)
				client.cancel()
				return
			}

			// Send ping
			client.writeMu.Lock()
			err := client.conn.WriteControl(websocket.PingMessage, []byte{}, time.Now().Add(pingInterval))
			client.writeMu.Unlock()

			if err != nil {
				log.Printf("Ping write failed: %v", err)
				// Don't immediately close - let pong timeout handle it
			}
		}
	}
}

// handleConnection processes messages from a WebSocket connection
func (s *Server) handleConnection(client *Client) {
	defer func() {
		// Cleanup on disconnect
		s.mu.Lock()
		delete(s.clients, client)
		s.mu.Unlock()

		// Release the workspace session
		if client.release != nil {
			client.release()
		}

		client.cancel()
		client.conn.Close()
		log.Printf("Client disconnected from workspace: %s", client.session.WorkspacePath)
	}()

	// Set up pong handler to track connection liveness
	client.conn.SetPongHandler(func(appData string) error {
		client.mu.Lock()
		client.lastPong = time.Now()
		client.mu.Unlock()
		return nil
	})

	for {
		messageType, data, err := client.conn.ReadMessage()
		if err != nil {
			// Check for normal closure
			if closeErr, ok := err.(*websocket.CloseError); ok {
				if closeErr.Code == websocket.CloseNormalClosure ||
					closeErr.Code == websocket.CloseGoingAway {
					return
				}
			}
			// Check if we initiated the close
			if client.ctx.Err() != nil {
				return
			}
			log.Printf("WebSocket read error: %v", err)
			return
		}

		// Only process text messages
		if messageType != websocket.TextMessage {
			continue
		}

		var req Request
		if err := json.Unmarshal(data, &req); err != nil {
			s.sendError(client, 0, -32700, "Parse error")
			continue
		}

		s.handleRequest(client, &req)
	}
}

// handleRequest dispatches a request to the appropriate handler
func (s *Server) handleRequest(client *Client, req *Request) {
	session := client.session
	var result interface{}
	var err error

	switch req.Method {
	// Filesystem methods - use client's session
	case "fs.readDirectory":
		result, err = s.handleReadDirectory(session, req.Params)
	case "fs.stat":
		result, err = s.handleStat(session, req.Params)
	case "fs.readFile":
		result, err = s.handleReadFile(session, req.Params)
	case "fs.writeFile":
		result, err = s.handleWriteFile(session, req.Params)
	case "fs.createDirectory":
		result, err = s.handleCreateDirectory(session, req.Params)
	case "fs.delete":
		result, err = s.handleDelete(session, req.Params)
	case "fs.rename":
		result, err = s.handleRename(session, req.Params)
	case "fs.exists":
		result, err = s.handleExists(session, req.Params)

	// Git methods
	case "git.status":
		result, err = s.handleGitStatus(session, req.Params)
	case "git.fileStatus":
		result, err = s.handleGitFileStatus(session, req.Params)
	case "git.branch":
		result, err = s.handleGitBranch(session, req.Params)
	case "git.branches":
		result, err = s.handleGitBranches(session, req.Params)
	case "git.diff":
		result, err = s.handleGitDiff(session, req.Params)
	case "git.fileAtRef":
		result, err = s.handleGitFileAtRef(session, req.Params)
	case "git.stage":
		result, err = s.handleGitStage(session, req.Params)
	case "git.unstage":
		result, err = s.handleGitUnstage(session, req.Params)
	case "git.commit":
		result, err = s.handleGitCommit(session, req.Params)
	case "git.checkout":
		result, err = s.handleGitCheckout(session, req.Params)
	case "git.revert":
		result, err = s.handleGitRevert(session, req.Params)
	case "git.hasUncommittedChanges":
		result, err = s.handleGitHasUncommittedChanges(session, req.Params)
	case "git.hasUnpushedCommits":
		result, err = s.handleGitHasUnpushedCommits(session, req.Params)
	case "git.changedFilesFromBranch":
		result, err = s.handleGitChangedFilesFromBranch(session, req.Params)
	case "git.uncommittedDiffStats":
		result, err = s.handleGitUncommittedDiffStats(session, req.Params)
	case "git.mostRecentDirtyFile":
		result, err = s.handleGitMostRecentDirtyFile(session, req.Params)
	case "git.statusFromBranch":
		result, err = s.handleGitStatusFromBranch(session, req.Params)
	case "git.mostRecentCommittedFile":
		result, err = s.handleGitMostRecentCommittedFile(session, req.Params)
	case "git.applyPatches":
		result, err = s.handleGitApplyPatches(session, req.Params)

	// Chunked patch methods for large files
	case "git.startChunkedPatch":
		result, err = s.handleGitStartChunkedPatch(req.Params)
	case "git.sendPatchChunk":
		result, err = s.handleGitSendPatchChunk(req.Params)
	case "git.finalizeChunkedPatch":
		result, err = s.handleGitFinalizeChunkedPatch(session, req.Params)
	case "git.cancelChunkedPatch":
		result, err = s.handleGitCancelChunkedPatch(req.Params)

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

// ============================================================================
// Parameter Types
// ============================================================================

type PathParams struct {
	Path string `json:"path"`
}

type WriteFileParams struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type DeleteParams struct {
	Path      string `json:"path"`
	Recursive bool   `json:"recursive"`
}

type RenameParams struct {
	OldPath string `json:"oldPath"`
	NewPath string `json:"newPath"`
}

type GitFilesParams struct {
	Files []string `json:"files"`
}

type GitDiffParams struct {
	Path   string `json:"path"`
	Staged bool   `json:"staged"`
}

type GitFileAtRefParams struct {
	Path string `json:"path"`
	Ref  string `json:"ref"`
}

type GitCommitParams struct {
	Message string                  `json:"message"`
	Options *types.GitCommitOptions `json:"options,omitempty"`
}

type GitCheckoutParams struct {
	Ref string `json:"ref"`
}

type GitBranchParams struct {
	BaseBranch string `json:"baseBranch"`
}

type GitMostRecentCommittedFileParams struct {
	CommitLimit int `json:"commitLimit"`
}

// ============================================================================
// Filesystem Handlers
// ============================================================================

func (s *Server) handleReadDirectory(session *session.Session, params json.RawMessage) (interface{}, error) {
	var p PathParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	path := p.Path
	if path == "" {
		path = session.Provider.CWD()
	}

	// Check cache first
	if cached := session.Cache.Get(path); cached != nil {
		session.Verifier.ScheduleVerify(path)
		go session.Prefetcher.PrefetchChildren(path, cached.Entries)
		return map[string]interface{}{"entries": cached.Entries}, nil
	}

	entries, err := session.Provider.ReadDirectory(path)
	if err != nil {
		return nil, err
	}

	session.Cache.Set(path, entries)
	go session.Prefetcher.PrefetchChildren(path, entries)

	return map[string]interface{}{"entries": entries}, nil
}

func (s *Server) handleStat(session *session.Session, params json.RawMessage) (interface{}, error) {
	var p PathParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	return session.Provider.Stat(p.Path)
}

func (s *Server) handleReadFile(session *session.Session, params json.RawMessage) (interface{}, error) {
	var p PathParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	content, err := session.Provider.ReadFile(p.Path)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"content": content}, nil
}

func (s *Server) handleWriteFile(session *session.Session, params json.RawMessage) (interface{}, error) {
	var p WriteFileParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	// Content is sent as base64 from the TypeScript client
	decoded, err := base64.StdEncoding.DecodeString(p.Content)
	if err != nil {
		return nil, fmt.Errorf("failed to decode base64 content: %w", err)
	}

	if err := session.Provider.WriteFile(p.Path, decoded); err != nil {
		return nil, err
	}
	return map[string]bool{"success": true}, nil
}

func (s *Server) handleCreateDirectory(session *session.Session, params json.RawMessage) (interface{}, error) {
	var p PathParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	if err := session.Provider.CreateDirectory(p.Path); err != nil {
		return nil, err
	}
	return map[string]bool{"success": true}, nil
}

func (s *Server) handleDelete(session *session.Session, params json.RawMessage) (interface{}, error) {
	var p DeleteParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	if err := session.Provider.Delete(p.Path, &types.DeleteOptions{Recursive: p.Recursive}); err != nil {
		return nil, err
	}
	return map[string]bool{"success": true}, nil
}

func (s *Server) handleRename(session *session.Session, params json.RawMessage) (interface{}, error) {
	var p RenameParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	if err := session.Provider.Rename(p.OldPath, p.NewPath); err != nil {
		return nil, err
	}
	return map[string]bool{"success": true}, nil
}

func (s *Server) handleExists(session *session.Session, params json.RawMessage) (interface{}, error) {
	var p PathParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	return map[string]bool{"exists": session.Provider.Exists(p.Path)}, nil
}

// ============================================================================
// Git Handlers
// ============================================================================

func (s *Server) handleGitStatus(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	return session.GitProvider.GetStatus()
}

func (s *Server) handleGitFileStatus(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	var p PathParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	return session.GitProvider.GetFileStatus(p.Path)
}

func (s *Server) handleGitBranch(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	branch, err := session.GitProvider.GetCurrentBranch()
	if err != nil {
		return nil, err
	}
	return map[string]string{"branch": branch}, nil
}

func (s *Server) handleGitBranches(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	branches, err := session.GitProvider.GetBranches()
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"branches": branches}, nil
}

func (s *Server) handleGitDiff(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	var p GitDiffParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	diff, err := session.GitProvider.GetFileDiff(p.Path, p.Staged)
	if err != nil {
		return nil, err
	}
	return map[string]string{"diff": diff}, nil
}

func (s *Server) handleGitFileAtRef(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	var p GitFileAtRefParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	content, err := session.GitProvider.GetFileAtRef(p.Path, p.Ref)
	if err != nil {
		return nil, err
	}
	return map[string]string{"content": content}, nil
}

func (s *Server) handleGitStage(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	var p GitFilesParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	if err := session.GitProvider.Stage(p.Files); err != nil {
		return nil, err
	}
	if session.GitWatcher != nil {
		session.GitWatcher.TriggerRefresh()
	}
	return map[string]bool{"success": true}, nil
}

func (s *Server) handleGitUnstage(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	var p GitFilesParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	if err := session.GitProvider.Unstage(p.Files); err != nil {
		return nil, err
	}
	if session.GitWatcher != nil {
		session.GitWatcher.TriggerRefresh()
	}
	return map[string]bool{"success": true}, nil
}

func (s *Server) handleGitCommit(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	var p GitCommitParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	commit, err := session.GitProvider.Commit(p.Message, p.Options)
	if err != nil {
		return nil, err
	}
	if session.GitWatcher != nil {
		session.GitWatcher.TriggerRefresh()
	}
	return map[string]interface{}{"commit": commit}, nil
}

func (s *Server) handleGitCheckout(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	var p GitCheckoutParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	if err := session.GitProvider.Checkout(p.Ref); err != nil {
		return nil, err
	}
	if session.GitWatcher != nil {
		session.GitWatcher.TriggerRefresh()
	}
	return map[string]bool{"success": true}, nil
}

func (s *Server) handleGitRevert(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	var p GitFilesParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	if err := session.GitProvider.Revert(p.Files); err != nil {
		return nil, err
	}
	if session.GitWatcher != nil {
		session.GitWatcher.TriggerRefresh()
	}
	return map[string]bool{"success": true}, nil
}

func (s *Server) handleGitHasUncommittedChanges(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	hasChanges, err := session.GitProvider.HasUncommittedChanges()
	if err != nil {
		return nil, err
	}
	return map[string]bool{"hasChanges": hasChanges}, nil
}

func (s *Server) handleGitHasUnpushedCommits(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	hasUnpushed, err := session.GitProvider.HasUnpushedCommits()
	if err != nil {
		return nil, err
	}
	return map[string]bool{"hasUnpushed": hasUnpushed}, nil
}

func (s *Server) handleGitChangedFilesFromBranch(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	var p GitBranchParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	files, err := session.GitProvider.GetChangedFilesFromBranch(p.BaseBranch)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"files": files}, nil
}

func (s *Server) handleGitUncommittedDiffStats(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	return session.GitProvider.GetUncommittedDiffStats()
}

func (s *Server) handleGitMostRecentDirtyFile(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	file, err := session.GitProvider.GetMostRecentDirtyFile()
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"file": file}, nil
}

func (s *Server) handleGitStatusFromBranch(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	var p GitBranchParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	return session.GitProvider.GetStatusFromBranch(p.BaseBranch)
}

func (s *Server) handleGitMostRecentCommittedFile(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	var p GitMostRecentCommittedFileParams
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}
	commitLimit := p.CommitLimit
	if commitLimit <= 0 {
		commitLimit = 10 // default
	}
	file, err := session.GitProvider.GetMostRecentCommittedFile(commitLimit)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"file": file}, nil
}

func (s *Server) handleGitApplyPatches(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}
	var p types.ApplyPatchesRequest
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, err
	}

	result, err := session.GitProvider.ApplyPatches(&p)
	if err != nil {
		return nil, err
	}

	// Trigger git watcher refresh to update status
	if session.GitWatcher != nil {
		session.GitWatcher.TriggerRefresh()
	}

	return result, nil
}

// ============================================================================
// Chunked Patch Handlers (for large files)
// ============================================================================

// handleGitStartChunkedPatch initiates a chunked patch transfer session
func (s *Server) handleGitStartChunkedPatch(params json.RawMessage) (interface{}, error) {
	var req types.StartChunkedPatchRequest
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, err
	}

	return s.chunkManager.StartSession(&req)
}

// handleGitSendPatchChunk receives a chunk of patch data
func (s *Server) handleGitSendPatchChunk(params json.RawMessage) (interface{}, error) {
	var chunk types.PatchChunk
	if err := json.Unmarshal(params, &chunk); err != nil {
		return nil, err
	}

	return s.chunkManager.AddChunk(&chunk)
}

// handleGitFinalizeChunkedPatch assembles chunks and applies the patches
func (s *Server) handleGitFinalizeChunkedPatch(session *session.Session, params json.RawMessage) (interface{}, error) {
	if session.GitProvider == nil {
		return nil, fmt.Errorf("not a git repository")
	}

	var req types.FinalizeChunkedPatchRequest
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, err
	}

	// Assemble all chunks into a complete request
	patchRequest, err := s.chunkManager.FinalizeSession(req.SessionID)
	if err != nil {
		return &types.ApplyPatchesResult{
			Success: false,
			Error:   err.Error(),
		}, nil
	}

	// Apply the assembled patches
	result, err := session.GitProvider.ApplyPatches(patchRequest)
	if err != nil {
		return nil, err
	}

	// Trigger git watcher refresh to update status
	if session.GitWatcher != nil {
		session.GitWatcher.TriggerRefresh()
	}

	return result, nil
}

// handleGitCancelChunkedPatch cancels an in-progress chunked transfer
func (s *Server) handleGitCancelChunkedPatch(params json.RawMessage) (interface{}, error) {
	var req struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, err
	}

	s.chunkManager.CancelSession(req.SessionID)
	return map[string]bool{"cancelled": true}, nil
}

// ============================================================================
// Response Helpers
// ============================================================================

func (s *Server) sendResponse(client *Client, id uint64, result interface{}) {
	msg := WebSocketMessage{Type: MsgTypeResponse, ID: id, Result: result}
	s.sendJSON(client, msg)
}

func (s *Server) sendError(client *Client, id uint64, code int, message string) {
	msg := WebSocketMessage{Type: MsgTypeError, ID: id, Error: &ErrorInfo{Code: code, Message: message}}
	s.sendJSON(client, msg)
}

func (s *Server) sendEvent(client *Client, eventType string, data interface{}) {
	msg := WebSocketMessage{Type: MsgTypeEvent, Event: eventType, Data: data}
	s.sendJSON(client, msg)
}

func (s *Server) sendJSON(client *Client, v interface{}) {
	client.writeMu.Lock()
	defer client.writeMu.Unlock()

	// Set write deadline
	client.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	
	if err := client.conn.WriteJSON(v); err != nil {
		log.Printf("WebSocket write error: %v", err)
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "ok",
		"sessions": s.manager.GetStats(),
		"clients":  len(s.clients),
	})
}

// ============================================================================
// Client Event Handler - forwards events to specific client
// ============================================================================

type clientEventHandler struct {
	client *Client
	server *Server
}

func (h *clientEventHandler) OnCreated(event types.FileCreatedEvent) {
	h.server.sendEvent(h.client, "fileCreated", event)
	h.emitDirectoryChanged(event.Path)
	h.triggerGitRefresh()
}

func (h *clientEventHandler) OnModified(event types.FileContentChangedEvent) {
	h.server.sendEvent(h.client, "fileChanged", event)
	h.triggerGitRefresh()
}

func (h *clientEventHandler) OnDeleted(event types.FileDeletedEvent) {
	h.client.session.Cache.Delete(event.Path)
	h.server.sendEvent(h.client, "fileDeleted", event)
	h.emitDirectoryChanged(event.Path)
	h.triggerGitRefresh()
}

func (h *clientEventHandler) OnRenamed(event types.FileRenamedEvent) {
	h.client.session.Cache.Delete(event.OldPath)
	h.server.sendEvent(h.client, "fileRenamed", event)
	h.emitDirectoryChanged(event.OldPath)
	h.emitDirectoryChanged(event.NewPath)
	h.triggerGitRefresh()
}

// triggerGitRefresh triggers a git status refresh if git is available.
func (h *clientEventHandler) triggerGitRefresh() {
	if h.client.session.GitWatcher != nil {
		h.client.session.GitWatcher.TriggerRefresh()
	}
}

func (h *clientEventHandler) emitDirectoryChanged(filePath string) {
	parentDir := filepath.Dir(filePath)
	entries, err := h.client.session.Provider.ReadDirectory(parentDir)
	if err != nil {
		return
	}
	h.client.session.Cache.Set(parentDir, entries)
	h.server.sendEvent(h.client, "directoryChanged", types.DirectoryListingChangedEvent{
		Path:    parentDir,
		Entries: entries,
	})
}

func (h *clientEventHandler) OnStatusChanged(event types.GitStatusChangedEvent) {
	h.server.sendEvent(h.client, "gitStatusChanged", event)
}

func (h *clientEventHandler) OnBranchChanged(event types.GitBranchChangedEvent) {
	h.server.sendEvent(h.client, "gitBranchChanged", event)
}

func (h *clientEventHandler) OnHeadChanged(event types.GitHeadChangedEvent) {
	h.server.sendEvent(h.client, "gitHeadChanged", event)
}
