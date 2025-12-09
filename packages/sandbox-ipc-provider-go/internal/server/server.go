// Package server provides HTTP API for filesystem operations.
package server

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"

	"github.com/lostintangent/conduit/packages/sandbox-ipc-provider-go/internal/cache"
	"github.com/lostintangent/conduit/packages/sandbox-ipc-provider-go/internal/fs"
	"github.com/lostintangent/conduit/packages/sandbox-ipc-provider-go/internal/types"
	"github.com/lostintangent/conduit/packages/sandbox-ipc-provider-go/internal/watcher"
)

// Server is the HTTP API server for filesystem operations.
type Server struct {
	provider *fs.Provider
	watcher  *watcher.Watcher
	cache    *cache.DirectoryCache
	mux      *http.ServeMux

	// SSE clients
	sseClients   map[chan types.FSEvent]struct{}
	sseClientsMu sync.RWMutex
}

// NewServer creates a new filesystem server.
func NewServer(workspacePath string) (*Server, error) {
	provider, err := fs.NewProvider(workspacePath)
	if err != nil {
		return nil, err
	}

	s := &Server{
		provider:   provider,
		cache:      cache.NewDirectoryCache(500),
		mux:        http.NewServeMux(),
		sseClients: make(map[chan types.FSEvent]struct{}),
	}

	// Create watcher with server as event handler
	w, err := watcher.NewWatcher(workspacePath, s)
	if err != nil {
		return nil, err
	}
	s.watcher = w

	// Register routes
	s.registerRoutes()

	return s, nil
}

// Start begins the server and file watcher.
func (s *Server) Start(addr string) error {
	// Start file watcher
	if err := s.watcher.Start(); err != nil {
		return err
	}

	fmt.Printf("🚀 Filesystem server running at http://%s\n", addr)
	fmt.Printf("📁 Workspace: %s\n", s.provider.CWD())
	fmt.Println("\nEndpoints:")
	fmt.Println("  GET  /api/events          - SSE event stream")
	fmt.Println("  GET  /api/fs/readDirectory?path=...")
	fmt.Println("  GET  /api/fs/stat?path=...")
	fmt.Println("  GET  /api/fs/readFile?path=...")
	fmt.Println("  POST /api/fs/writeFile?path=...")
	fmt.Println("  POST /api/fs/createDirectory?path=...")
	fmt.Println("  DELETE /api/fs/delete?path=...&recursive=true")
	fmt.Println("  POST /api/fs/rename?oldPath=...&newPath=...")
	fmt.Println("  GET  /api/fs/exists?path=...")
	fmt.Println("\nPress Ctrl+C to stop\n")

	return http.ListenAndServe(addr, s.corsMiddleware(s.mux))
}

// Stop shuts down the server.
func (s *Server) Stop() error {
	return s.watcher.Stop()
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("/api/events", s.handleSSE)
	s.mux.HandleFunc("/api/fs/readDirectory", s.handleReadDirectory)
	s.mux.HandleFunc("/api/fs/stat", s.handleStat)
	s.mux.HandleFunc("/api/fs/readFile", s.handleReadFile)
	s.mux.HandleFunc("/api/fs/writeFile", s.handleWriteFile)
	s.mux.HandleFunc("/api/fs/createDirectory", s.handleCreateDirectory)
	s.mux.HandleFunc("/api/fs/delete", s.handleDelete)
	s.mux.HandleFunc("/api/fs/rename", s.handleRename)
	s.mux.HandleFunc("/api/fs/exists", s.handleExists)
	s.mux.HandleFunc("/health", s.handleHealth)
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// SSE Handler
func (s *Server) handleSSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "SSE not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	eventCh := make(chan types.FSEvent, 100)

	s.sseClientsMu.Lock()
	s.sseClients[eventCh] = struct{}{}
	s.sseClientsMu.Unlock()

	defer func() {
		s.sseClientsMu.Lock()
		delete(s.sseClients, eventCh)
		s.sseClientsMu.Unlock()
		close(eventCh)
	}()

	// Send connected event
	fmt.Fprintf(w, "event: connected\ndata: {}\n\n")
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case event := <-eventCh:
			data, _ := json.Marshal(event.Data)
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Type, string(data))
			flusher.Flush()
		}
	}
}

func (s *Server) broadcastEvent(eventType string, data interface{}) {
	event := types.FSEvent{
		Type: eventType,
		Data: data,
	}

	s.sseClientsMu.RLock()
	defer s.sseClientsMu.RUnlock()

	for ch := range s.sseClients {
		select {
		case ch <- event:
		default:
			// Client buffer full, skip
		}
	}
}

// File System Handlers

func (s *Server) handleReadDirectory(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		path = s.provider.CWD()
	}

	// Check cache first
	if cached := s.cache.Get(path); cached != nil {
		s.jsonResponse(w, map[string]interface{}{"entries": cached.Entries})
		return
	}

	entries, err := s.provider.ReadDirectory(path)
	if err != nil {
		s.errorResponse(w, err)
		return
	}

	// Cache the result
	s.cache.Set(path, entries)

	s.jsonResponse(w, map[string]interface{}{"entries": entries})
}

func (s *Server) handleStat(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}

	stat, err := s.provider.Stat(path)
	if err != nil {
		s.errorResponse(w, err)
		return
	}

	s.jsonResponse(w, stat)
}

func (s *Server) handleReadFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}

	content, err := s.provider.ReadFile(path)
	if err != nil {
		s.errorResponse(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Write(content)
}

func (s *Server) handleWriteFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}

	content, err := io.ReadAll(r.Body)
	if err != nil {
		s.errorResponse(w, err)
		return
	}

	if err := s.provider.WriteFile(path, content); err != nil {
		s.errorResponse(w, err)
		return
	}

	s.jsonResponse(w, map[string]bool{"success": true})
}

func (s *Server) handleCreateDirectory(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}

	if err := s.provider.CreateDirectory(path); err != nil {
		s.errorResponse(w, err)
		return
	}

	s.jsonResponse(w, map[string]bool{"success": true})
}

func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != "DELETE" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}

	recursive := r.URL.Query().Get("recursive") == "true"

	if err := s.provider.Delete(path, &types.DeleteOptions{Recursive: recursive}); err != nil {
		s.errorResponse(w, err)
		return
	}

	s.jsonResponse(w, map[string]bool{"success": true})
}

func (s *Server) handleRename(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	oldPath := r.URL.Query().Get("oldPath")
	newPath := r.URL.Query().Get("newPath")

	if oldPath == "" || newPath == "" {
		http.Error(w, "oldPath and newPath are required", http.StatusBadRequest)
		return
	}

	if err := s.provider.Rename(oldPath, newPath); err != nil {
		s.errorResponse(w, err)
		return
	}

	s.jsonResponse(w, map[string]bool{"success": true})
}

func (s *Server) handleExists(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}

	exists := s.provider.Exists(path)

	s.jsonResponse(w, map[string]bool{"exists": exists})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	s.jsonResponse(w, map[string]interface{}{
		"status":    "ok",
		"workspace": s.provider.CWD(),
		"watching":  s.watcher.IsWatching(),
	})
}

// EventHandler implementation

func (s *Server) OnCreated(event types.FileCreatedEvent) {
	s.broadcastEvent("fileCreated", event)
}

func (s *Server) OnModified(event types.FileContentChangedEvent) {
	s.broadcastEvent("fileChanged", event)
}

func (s *Server) OnDeleted(event types.FileDeletedEvent) {
	s.cache.Delete(event.Path)
	s.broadcastEvent("fileDeleted", event)
}

func (s *Server) OnRenamed(event types.FileRenamedEvent) {
	s.cache.Delete(event.OldPath)
	s.broadcastEvent("fileRenamed", event)
}

// Helper methods

func (s *Server) jsonResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func (s *Server) errorResponse(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusInternalServerError)
	json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}
