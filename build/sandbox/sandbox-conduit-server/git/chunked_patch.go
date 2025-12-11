// Package git provides git operations using the git CLI.
package git

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"sync"
	"time"

	"sandbox-ipc-provider-go/types"
)

// ChunkedPatchSession manages the assembly of chunked patch data
type ChunkedPatchSession struct {
	SessionID   string
	CreatedAt   time.Time
	ExpiredAt   time.Time
	Patches     map[types.PatchType]*PatchAssembly
	mu          sync.Mutex
	isFinalized bool
}

// PatchAssembly holds chunks for a single patch type
type PatchAssembly struct {
	PatchType   types.PatchType
	TotalSize   int64
	TotalChunks int
	Chunks      map[int][]byte
	ReceivedAt  []time.Time
}

// ChunkedPatchManager manages multiple chunked patch sessions
type ChunkedPatchManager struct {
	sessions map[string]*ChunkedPatchSession
	mu       sync.RWMutex
	// Session timeout duration
	sessionTimeout time.Duration
}

// NewChunkedPatchManager creates a new manager for chunked patches
func NewChunkedPatchManager() *ChunkedPatchManager {
	m := &ChunkedPatchManager{
		sessions:       make(map[string]*ChunkedPatchSession),
		sessionTimeout: 5 * time.Minute,
	}
	// Start cleanup goroutine
	go m.cleanupExpiredSessions()
	return m
}

// cleanupExpiredSessions periodically removes expired sessions
func (m *ChunkedPatchManager) cleanupExpiredSessions() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		m.mu.Lock()
		now := time.Now()
		for id, session := range m.sessions {
			if now.After(session.ExpiredAt) {
				delete(m.sessions, id)
			}
		}
		m.mu.Unlock()
	}
}

// StartSession creates a new chunked patch session
func (m *ChunkedPatchManager) StartSession(req *types.StartChunkedPatchRequest) (*types.StartChunkedPatchResponse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check if session already exists
	if _, exists := m.sessions[req.SessionID]; exists {
		return &types.StartChunkedPatchResponse{
			SessionID: req.SessionID,
			Ready:     false,
			Error:     "session already exists",
		}, nil
	}

	now := time.Now()
	session := &ChunkedPatchSession{
		SessionID: req.SessionID,
		CreatedAt: now,
		ExpiredAt: now.Add(m.sessionTimeout),
		Patches:   make(map[types.PatchType]*PatchAssembly),
	}

	// Initialize patch assemblies for each expected patch
	for _, info := range req.Patches {
		session.Patches[info.PatchType] = &PatchAssembly{
			PatchType:   info.PatchType,
			TotalSize:   info.TotalSize,
			TotalChunks: info.TotalChunks,
			Chunks:      make(map[int][]byte),
			ReceivedAt:  make([]time.Time, info.TotalChunks),
		}
	}

	m.sessions[req.SessionID] = session

	return &types.StartChunkedPatchResponse{
		SessionID: req.SessionID,
		Ready:     true,
	}, nil
}

// AddChunk adds a chunk to an existing session
func (m *ChunkedPatchManager) AddChunk(chunk *types.PatchChunk) (*types.PatchChunkAck, error) {
	m.mu.RLock()
	session, exists := m.sessions[chunk.SessionID]
	m.mu.RUnlock()

	if !exists {
		return &types.PatchChunkAck{
			SessionID:  chunk.SessionID,
			ChunkIndex: chunk.ChunkIndex,
			Received:   false,
			Error:      "session not found",
		}, nil
	}

	session.mu.Lock()
	defer session.mu.Unlock()

	// Check if session is finalized
	if session.isFinalized {
		return &types.PatchChunkAck{
			SessionID:  chunk.SessionID,
			ChunkIndex: chunk.ChunkIndex,
			Received:   false,
			Error:      "session already finalized",
		}, nil
	}

	// Refresh expiration
	session.ExpiredAt = time.Now().Add(m.sessionTimeout)

	// Get patch assembly
	assembly, exists := session.Patches[chunk.PatchType]
	if !exists {
		return &types.PatchChunkAck{
			SessionID:  chunk.SessionID,
			ChunkIndex: chunk.ChunkIndex,
			Received:   false,
			Error:      fmt.Sprintf("unknown patch type: %s", chunk.PatchType),
		}, nil
	}

	// Validate chunk index
	if chunk.ChunkIndex < 0 || chunk.ChunkIndex >= assembly.TotalChunks {
		return &types.PatchChunkAck{
			SessionID:  chunk.SessionID,
			ChunkIndex: chunk.ChunkIndex,
			Received:   false,
			Error:      fmt.Sprintf("invalid chunk index: %d (total: %d)", chunk.ChunkIndex, assembly.TotalChunks),
		}, nil
	}

	// Store chunk
	assembly.Chunks[chunk.ChunkIndex] = chunk.Data
	assembly.ReceivedAt[chunk.ChunkIndex] = time.Now()

	return &types.PatchChunkAck{
		SessionID:  chunk.SessionID,
		ChunkIndex: chunk.ChunkIndex,
		Received:   true,
	}, nil
}

// FinalizeSession marks the session as complete and returns assembled patches
func (m *ChunkedPatchManager) FinalizeSession(sessionID string) (*types.ApplyPatchesRequest, error) {
	m.mu.Lock()
	session, exists := m.sessions[sessionID]
	if !exists {
		m.mu.Unlock()
		return nil, fmt.Errorf("session not found: %s", sessionID)
	}
	m.mu.Unlock()

	session.mu.Lock()
	defer session.mu.Unlock()

	if session.isFinalized {
		return nil, fmt.Errorf("session already finalized")
	}

	// Verify all chunks are received and assemble patches
	request := &types.ApplyPatchesRequest{}

	for patchType, assembly := range session.Patches {
		// Check all chunks received
		if len(assembly.Chunks) != assembly.TotalChunks {
			return nil, fmt.Errorf("incomplete patch %s: received %d of %d chunks",
				patchType, len(assembly.Chunks), assembly.TotalChunks)
		}

		// Assemble chunks in order
		var buf bytes.Buffer
		for i := 0; i < assembly.TotalChunks; i++ {
			chunk, exists := assembly.Chunks[i]
			if !exists {
				return nil, fmt.Errorf("missing chunk %d for patch %s", i, patchType)
			}
			buf.Write(chunk)
		}

		// Verify total size
		assembled := buf.Bytes()
		if int64(len(assembled)) != assembly.TotalSize {
			return nil, fmt.Errorf("size mismatch for patch %s: expected %d, got %d",
				patchType, assembly.TotalSize, len(assembled))
		}

		// Store as base64 for compatibility with existing ApplyPatches
		// The ApplyPatches method expects base64-encoded strings
		encoded := base64.StdEncoding.EncodeToString(assembled)

		switch patchType {
		case types.PatchTypeStaged:
			request.Staged = encoded
		case types.PatchTypeUnstaged:
			request.Unstaged = encoded
		case types.PatchTypeUntracked:
			request.Untracked = encoded
		}
	}

	session.isFinalized = true

	// Clean up session
	m.mu.Lock()
	delete(m.sessions, sessionID)
	m.mu.Unlock()

	return request, nil
}

// GetSessionStatus returns the current status of a session
func (m *ChunkedPatchManager) GetSessionStatus(sessionID string) (map[types.PatchType]int, error) {
	m.mu.RLock()
	session, exists := m.sessions[sessionID]
	m.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("session not found: %s", sessionID)
	}

	session.mu.Lock()
	defer session.mu.Unlock()

	status := make(map[types.PatchType]int)
	for patchType, assembly := range session.Patches {
		status[patchType] = len(assembly.Chunks)
	}

	return status, nil
}

// CancelSession removes a session without applying
func (m *ChunkedPatchManager) CancelSession(sessionID string) {
	m.mu.Lock()
	delete(m.sessions, sessionID)
	m.mu.Unlock()
}
