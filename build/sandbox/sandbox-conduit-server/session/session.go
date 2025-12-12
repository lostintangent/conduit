// Package session manages workspace sessions with reference counting.
// Multiple clients can share the same workspace session, and resources
// are automatically cleaned up when the last client disconnects.
package session

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"

	"sandbox-conduit-server/fs"
	"sandbox-conduit-server/git"
	"sandbox-conduit-server/types"
)

// Session represents an active workspace session with filesystem
// and git providers, caching, and file watching.
type Session struct {
	WorkspacePath string
	Provider      *fs.Provider
	Cache         *fs.DirectoryCache
	Watcher       *fs.Watcher
	Prefetcher    *fs.Prefetcher
	Verifier      *fs.CacheVerifier
	GitProvider   *git.Provider
	GitWatcher    *git.Watcher
}

// managedSession wraps a Session with reference counting.
type managedSession struct {
	session  *Session
	refCount int
	mu       sync.Mutex
}

// Manager manages workspace sessions with reference counting.
// Multiple clients can share the same workspace, and resources
// are cleaned up when the last client disconnects.
type Manager struct {
	sessions map[string]*managedSession
	mu       sync.Mutex
}

// NewManager creates a new workspace manager.
func NewManager() *Manager {
	return &Manager{
		sessions: make(map[string]*managedSession),
	}
}

// SessionStats contains statistics about a workspace session.
type SessionStats struct {
	Path     string `json:"path"`
	RefCount int    `json:"refCount"`
	HasGit   bool   `json:"hasGit"`
}

// GetStats returns statistics about all active sessions.
func (m *Manager) GetStats() []SessionStats {
	m.mu.Lock()
	defer m.mu.Unlock()

	stats := make([]SessionStats, 0, len(m.sessions))
	for path, managed := range m.sessions {
		managed.mu.Lock()
		stats = append(stats, SessionStats{
			Path:     path,
			RefCount: managed.refCount,
			HasGit:   managed.session.GitProvider != nil,
		})
		managed.mu.Unlock()
	}
	return stats
}

// Acquire gets or creates a workspace session.
// The client parameter is used for event dispatching.
// The handler parameter receives filesystem and git events.
// Returns the session, a release function, and any error.
// The release function MUST be called when the client is done with the session.
func (m *Manager) Acquire(workspacePath string, client interface{}, handler fs.EventHandler) (*Session, func(), error) {
	absPath, err := filepath.Abs(workspacePath)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid workspace path: %w", err)
	}

	// Check if path exists and is a directory
	info, err := os.Stat(absPath)
	if err != nil {
		return nil, nil, fmt.Errorf("workspace path does not exist: %w", err)
	}
	if !info.IsDir() {
		return nil, nil, fmt.Errorf("workspace path is not a directory: %s", absPath)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Check for existing session
	if managed, exists := m.sessions[absPath]; exists {
		managed.mu.Lock()
		managed.refCount++
		log.Printf("Workspace %s: acquired (refCount=%d)", absPath, managed.refCount)
		managed.mu.Unlock()

		return managed.session, m.createReleaseFunc(absPath), nil
	}

	// Create new session
	session, err := m.createSession(absPath, handler)
	if err != nil {
		return nil, nil, err
	}

	managed := &managedSession{
		session:  session,
		refCount: 1,
	}
	m.sessions[absPath] = managed

	log.Printf("Workspace %s: created new session", absPath)

	return session, m.createReleaseFunc(absPath), nil
}

// createSession creates a new workspace session with all components.
func (m *Manager) createSession(workspacePath string, handler fs.EventHandler) (*Session, error) {
	// Create filesystem provider
	provider, err := fs.NewProvider(workspacePath)
	if err != nil {
		return nil, fmt.Errorf("failed to create fs provider: %w", err)
	}

	// Create cache
	cache := fs.NewDirectoryCache(1000) // Cache up to 1000 directories

	// Create prefetcher
	prefetcher := fs.NewPrefetcher(provider, cache)

	// Create verifier
	verifier := fs.NewCacheVerifier(provider, cache)

	// Create file watcher
	watcher, err := fs.NewWatcher(workspacePath, handler)
	if err != nil {
		return nil, fmt.Errorf("failed to create watcher: %w", err)
	}

	// Start watcher
	if err := watcher.Start(); err != nil {
		return nil, fmt.Errorf("failed to start watcher: %w", err)
	}

	// Wire up cache invalidation on file changes
	// When files change, we need to invalidate the parent directory cache
	verifier.SetStaleCallback(func(path string, entries []types.DirectoryEntry) {
		// The verifier already updates the cache, we just log for debugging
		log.Printf("Cache stale for %s, updated with %d entries", path, len(entries))
	})

	session := &Session{
		WorkspacePath: workspacePath,
		Provider:      provider,
		Cache:         cache,
		Watcher:       watcher,
		Prefetcher:    prefetcher,
		Verifier:      verifier,
	}

	// Try to set up git provider
	gitRoot := findGitRoot(workspacePath)
	if gitRoot != "" {
		gitProvider, err := git.NewProvider(gitRoot, workspacePath)
		if err == nil {
			session.GitProvider = gitProvider

			// Create git watcher - note: we don't have a git EventHandler here,
			// so we skip the git watcher for now. It will be set up by the server
			// when a client connects.
		}
	}

	return session, nil
}

// createReleaseFunc creates a release function for a workspace session.
func (m *Manager) createReleaseFunc(workspacePath string) func() {
	released := false
	return func() {
		if released {
			return // Prevent double-release
		}
		released = true

		m.mu.Lock()
		defer m.mu.Unlock()

		managed, exists := m.sessions[workspacePath]
		if !exists {
			return
		}

		managed.mu.Lock()
		managed.refCount--
		refCount := managed.refCount
		managed.mu.Unlock()

		log.Printf("Workspace %s: released (refCount=%d)", workspacePath, refCount)

		if refCount <= 0 {
			// Clean up session resources
			m.cleanupSession(managed.session)
			delete(m.sessions, workspacePath)
			log.Printf("Workspace %s: session closed", workspacePath)
		}
	}
}

// cleanupSession releases all resources held by a session.
func (m *Manager) cleanupSession(session *Session) {
	if session.Watcher != nil {
		session.Watcher.Stop()
	}
	if session.GitWatcher != nil {
		session.GitWatcher.Stop()
	}
}

// findGitRoot walks up the directory tree to find a .git directory.
func findGitRoot(start string) string {
	current := start
	for {
		gitPath := filepath.Join(current, ".git")
		if info, err := os.Stat(gitPath); err == nil && info.IsDir() {
			return current
		}

		parent := filepath.Dir(current)
		if parent == current {
			// Reached filesystem root
			return ""
		}
		current = parent
	}
}
