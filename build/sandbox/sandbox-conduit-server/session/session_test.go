package session

import (
"os"
"path/filepath"
"sync"
"testing"

"sandbox-conduit-server/types"
)

// mockEventHandler implements fs.EventHandler for testing
type mockEventHandler struct{}

func (m *mockEventHandler) OnCreated(event types.FileCreatedEvent)         {}
func (m *mockEventHandler) OnModified(event types.FileContentChangedEvent) {}
func (m *mockEventHandler) OnDeleted(event types.FileDeletedEvent)         {}
func (m *mockEventHandler) OnRenamed(event types.FileRenamedEvent)         {}

func TestNewManager(t *testing.T) {
	manager := NewManager()
	if manager == nil {
		t.Fatal("NewManager returned nil")
	}
	if manager.sessions == nil {
		t.Fatal("sessions map is nil")
	}
	if len(manager.sessions) != 0 {
		t.Fatalf("expected 0 sessions, got %d", len(manager.sessions))
	}
}

func TestManagerGetStats_Empty(t *testing.T) {
	manager := NewManager()
	stats := manager.GetStats()
	if len(stats) != 0 {
		t.Fatalf("expected 0 stats, got %d", len(stats))
	}
}

func TestManagerAcquire_InvalidPath(t *testing.T) {
	manager := NewManager()
	handler := &mockEventHandler{}

	_, _, err := manager.Acquire("/nonexistent/path/that/does/not/exist", nil, handler)
	if err == nil {
		t.Fatal("expected error for non-existent path")
	}
}

func TestManagerAcquire_NotDirectory(t *testing.T) {
	manager := NewManager()
	handler := &mockEventHandler{}

	tmpFile, err := os.CreateTemp("", "session_test_*")
	if err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}
	defer os.Remove(tmpFile.Name())
	tmpFile.Close()

	_, _, err = manager.Acquire(tmpFile.Name(), nil, handler)
	if err == nil {
		t.Fatal("expected error for file (not directory)")
	}
}

func TestManagerAcquire_ValidDirectory(t *testing.T) {
	manager := NewManager()
	handler := &mockEventHandler{}

	tmpDir, err := os.MkdirTemp("", "session_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	session, release, err := manager.Acquire(tmpDir, nil, handler)
	if err != nil {
		t.Fatalf("Acquire failed: %v", err)
	}
	if session == nil {
		t.Fatal("session is nil")
	}
	if release == nil {
		t.Fatal("release function is nil")
	}

	absPath, _ := filepath.Abs(tmpDir)
	if session.WorkspacePath != absPath {
		t.Errorf("expected WorkspacePath %s, got %s", absPath, session.WorkspacePath)
	}
	if session.Provider == nil {
		t.Error("Provider is nil")
	}
	if session.Cache == nil {
		t.Error("Cache is nil")
	}
	if session.Watcher == nil {
		t.Error("Watcher is nil")
	}

	stats := manager.GetStats()
	if len(stats) != 1 {
		t.Fatalf("expected 1 stat, got %d", len(stats))
	}
	if stats[0].RefCount != 1 {
		t.Errorf("expected refCount 1, got %d", stats[0].RefCount)
	}

	release()
	stats = manager.GetStats()
	if len(stats) != 0 {
		t.Fatalf("expected 0 stats after release, got %d", len(stats))
	}
}

func TestManagerAcquire_MultipleClients(t *testing.T) {
	manager := NewManager()
	handler := &mockEventHandler{}

	tmpDir, err := os.MkdirTemp("", "session_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	session1, release1, err := manager.Acquire(tmpDir, nil, handler)
	if err != nil {
		t.Fatalf("first Acquire failed: %v", err)
	}

	session2, release2, err := manager.Acquire(tmpDir, nil, handler)
	if err != nil {
		t.Fatalf("second Acquire failed: %v", err)
	}

	if session1 != session2 {
		t.Error("expected same session for same workspace")
	}

	stats := manager.GetStats()
	if len(stats) != 1 {
		t.Fatalf("expected 1 stat, got %d", len(stats))
	}
	if stats[0].RefCount != 2 {
		t.Errorf("expected refCount 2, got %d", stats[0].RefCount)
	}

	release1()
	stats = manager.GetStats()
	if stats[0].RefCount != 1 {
		t.Errorf("expected refCount 1 after first release, got %d", stats[0].RefCount)
	}

	release2()
	stats = manager.GetStats()
	if len(stats) != 0 {
		t.Fatalf("expected 0 stats after all releases, got %d", len(stats))
	}
}

func TestManagerAcquire_DoubleRelease(t *testing.T) {
	manager := NewManager()
	handler := &mockEventHandler{}

	tmpDir, err := os.MkdirTemp("", "session_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	_, release, err := manager.Acquire(tmpDir, nil, handler)
	if err != nil {
		t.Fatalf("Acquire failed: %v", err)
	}

	release()
	release() // Should not panic

	stats := manager.GetStats()
	if len(stats) != 0 {
		t.Fatalf("expected 0 stats, got %d", len(stats))
	}
}

func TestManagerAcquire_ConcurrentAccess(t *testing.T) {
	manager := NewManager()
	handler := &mockEventHandler{}

	tmpDir, err := os.MkdirTemp("", "session_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	const numGoroutines = 10
	var wg sync.WaitGroup
	releases := make([]func(), numGoroutines)
	errors := make([]error, numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			_, release, err := manager.Acquire(tmpDir, nil, handler)
			releases[idx] = release
			errors[idx] = err
		}(i)
	}
	wg.Wait()

	for i, err := range errors {
		if err != nil {
			t.Errorf("goroutine %d failed: %v", i, err)
		}
	}

	stats := manager.GetStats()
	if len(stats) != 1 {
		t.Fatalf("expected 1 stat, got %d", len(stats))
	}
	if stats[0].RefCount != numGoroutines {
		t.Errorf("expected refCount %d, got %d", numGoroutines, stats[0].RefCount)
	}

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			if releases[idx] != nil {
				releases[idx]()
			}
		}(i)
	}
	wg.Wait()

	stats = manager.GetStats()
	if len(stats) != 0 {
		t.Fatalf("expected 0 stats after all releases, got %d", len(stats))
	}
}

func TestFindGitRoot(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "session_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	result := findGitRoot(tmpDir)
	if result != "" {
		t.Errorf("expected empty string for non-git dir, got %s", result)
	}

	gitDir := filepath.Join(tmpDir, ".git")
	if err := os.Mkdir(gitDir, 0755); err != nil {
		t.Fatalf("failed to create .git dir: %v", err)
	}

	result = findGitRoot(tmpDir)
	if result != tmpDir {
		t.Errorf("expected %s, got %s", tmpDir, result)
	}

	subDir := filepath.Join(tmpDir, "subdir")
	if err := os.Mkdir(subDir, 0755); err != nil {
		t.Fatalf("failed to create subdir: %v", err)
	}

	result = findGitRoot(subDir)
	if result != tmpDir {
		t.Errorf("expected %s from subdir, got %s", tmpDir, result)
	}
}
