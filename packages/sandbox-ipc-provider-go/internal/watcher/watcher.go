// Package watcher provides file system watching with rename detection.
package watcher

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/lostintangent/conduit/packages/sandbox-ipc-provider-go/internal/types"
)

// DefaultIgnorePatterns contains patterns to ignore for performance.
var DefaultIgnorePatterns = []string{
	"node_modules",
	".git",
	"dist",
	"build",
	".next",
	".cache",
	"coverage",
	".DS_Store",
}

// EventHandler handles filesystem events.
type EventHandler interface {
	OnCreated(event types.FileCreatedEvent)
	OnModified(event types.FileContentChangedEvent)
	OnDeleted(event types.FileDeletedEvent)
	OnRenamed(event types.FileRenamedEvent)
}

// Watcher watches for filesystem changes.
type Watcher struct {
	path           string
	fsWatcher      *fsnotify.Watcher
	handler        EventHandler
	ignorePatterns []string
	watching       bool
	mu             sync.RWMutex

	// Rename detection
	pendingDeletes map[string]time.Time
	pendingCreates map[string]time.Time
	renameMu       sync.Mutex

	// Debouncing
	debounceTimers map[string]*time.Timer
	debounceMu     sync.Mutex

	// Stop channel
	stopCh chan struct{}
}

// NewWatcher creates a new file watcher.
func NewWatcher(path string, handler EventHandler) (*Watcher, error) {
	fsWatcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	return &Watcher{
		path:           path,
		fsWatcher:      fsWatcher,
		handler:        handler,
		ignorePatterns: DefaultIgnorePatterns,
		pendingDeletes: make(map[string]time.Time),
		pendingCreates: make(map[string]time.Time),
		debounceTimers: make(map[string]*time.Timer),
		stopCh:         make(chan struct{}),
	}, nil
}

// SetIgnorePatterns sets custom ignore patterns.
func (w *Watcher) SetIgnorePatterns(patterns []string) {
	w.ignorePatterns = patterns
}

// Start begins watching for changes.
func (w *Watcher) Start() error {
	w.mu.Lock()
	if w.watching {
		w.mu.Unlock()
		return nil
	}
	w.watching = true
	w.mu.Unlock()

	// Add the root path and all subdirectories
	if err := w.addRecursive(w.path); err != nil {
		return err
	}

	// Start event processing goroutine
	go w.processEvents()

	// Start cleanup goroutine for pending renames
	go w.cleanupPendingRenames()

	return nil
}

// Stop stops watching for changes.
func (w *Watcher) Stop() error {
	w.mu.Lock()
	if !w.watching {
		w.mu.Unlock()
		return nil
	}
	w.watching = false
	w.mu.Unlock()

	close(w.stopCh)
	return w.fsWatcher.Close()
}

// IsWatching returns whether the watcher is active.
func (w *Watcher) IsWatching() bool {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.watching
}

func (w *Watcher) addRecursive(path string) error {
	return filepath.Walk(path, func(walkPath string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip errors
		}

		// Skip ignored paths
		if w.shouldIgnore(walkPath) {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		// Only watch directories
		if info.IsDir() {
			return w.fsWatcher.Add(walkPath)
		}

		return nil
	})
}

func (w *Watcher) shouldIgnore(path string) bool {
	name := filepath.Base(path)
	for _, pattern := range w.ignorePatterns {
		if name == pattern {
			return true
		}
		if strings.Contains(path, string(filepath.Separator)+pattern+string(filepath.Separator)) {
			return true
		}
	}
	return false
}

func (w *Watcher) processEvents() {
	for {
		select {
		case <-w.stopCh:
			return

		case event, ok := <-w.fsWatcher.Events:
			if !ok {
				return
			}

			if w.shouldIgnore(event.Name) {
				continue
			}

			w.handleEvent(event)

		case err, ok := <-w.fsWatcher.Errors:
			if !ok {
				return
			}
			// Log error but continue
			_ = err
		}
	}
}

func (w *Watcher) handleEvent(event fsnotify.Event) {
	path := event.Name

	switch {
	case event.Op&fsnotify.Create == fsnotify.Create:
		w.handleCreate(path)

	case event.Op&fsnotify.Write == fsnotify.Write:
		w.handleModify(path)

	case event.Op&fsnotify.Remove == fsnotify.Remove:
		w.handleDelete(path)

	case event.Op&fsnotify.Rename == fsnotify.Rename:
		// fsnotify emits Rename for the old path
		w.handleDelete(path)
	}
}

func (w *Watcher) handleCreate(path string) {
	// Check if this matches a pending delete (rename detection)
	w.renameMu.Lock()
	oldPath := w.matchCreateWithDelete(path)
	if oldPath != "" {
		w.renameMu.Unlock()
		w.cancelDebounce("delete:" + oldPath)
		w.emitRename(oldPath, path)
		return
	}

	// Record this create for potential rename matching
	w.pendingCreates[path] = time.Now()
	w.renameMu.Unlock()

	// Debounce the create event
	w.debounce("create:"+path, 200*time.Millisecond, func() {
		// Re-check for rename match
		w.renameMu.Lock()
		oldPath := w.matchCreateWithDelete(path)
		delete(w.pendingCreates, path)
		w.renameMu.Unlock()

		if oldPath != "" {
			w.cancelDebounce("delete:" + oldPath)
			w.emitRename(oldPath, path)
		} else {
			isDir := w.isDirectory(path)
			w.handler.OnCreated(types.FileCreatedEvent{
				Path:        path,
				IsDirectory: isDir,
			})

			// If a new directory was created, watch it
			if isDir {
				_ = w.addRecursive(path)
			}
		}
	})
}

func (w *Watcher) handleModify(path string) {
	w.debounce("modify:"+path, 50*time.Millisecond, func() {
		w.handler.OnModified(types.FileContentChangedEvent{
			Path: path,
		})
	})
}

func (w *Watcher) handleDelete(path string) {
	// Check if this matches a pending create (rename detection)
	w.renameMu.Lock()
	newPath := w.matchDeleteWithCreate(path)
	if newPath != "" {
		w.renameMu.Unlock()
		w.cancelDebounce("create:" + newPath)
		w.emitRename(path, newPath)
		return
	}

	// Record this delete for potential rename matching
	w.pendingDeletes[path] = time.Now()
	w.renameMu.Unlock()

	// Debounce the delete event
	w.debounce("delete:"+path, 200*time.Millisecond, func() {
		// Re-check for rename match
		w.renameMu.Lock()
		newPath := w.matchDeleteWithCreate(path)
		delete(w.pendingDeletes, path)
		w.renameMu.Unlock()

		if newPath != "" {
			w.cancelDebounce("create:" + newPath)
			w.emitRename(path, newPath)
		} else {
			w.handler.OnDeleted(types.FileDeletedEvent{
				Path:        path,
				IsDirectory: false, // Can't determine for deleted files
			})
		}
	})
}

func (w *Watcher) matchCreateWithDelete(newPath string) string {
	newDir := filepath.Dir(newPath)
	now := time.Now()
	correlationWindow := 500 * time.Millisecond

	for oldPath, timestamp := range w.pendingDeletes {
		if now.Sub(timestamp) > correlationWindow {
			continue
		}

		if filepath.Dir(oldPath) != newDir {
			continue
		}

		if oldPath == newPath {
			continue
		}

		delete(w.pendingDeletes, oldPath)
		return oldPath
	}

	return ""
}

func (w *Watcher) matchDeleteWithCreate(oldPath string) string {
	oldDir := filepath.Dir(oldPath)
	now := time.Now()
	correlationWindow := 500 * time.Millisecond

	for newPath, timestamp := range w.pendingCreates {
		if now.Sub(timestamp) > correlationWindow {
			continue
		}

		if filepath.Dir(newPath) != oldDir {
			continue
		}

		if oldPath == newPath {
			continue
		}

		delete(w.pendingCreates, newPath)
		return newPath
	}

	return ""
}

func (w *Watcher) emitRename(oldPath, newPath string) {
	isDir := w.isDirectory(newPath)
	w.handler.OnRenamed(types.FileRenamedEvent{
		OldPath:     oldPath,
		NewPath:     newPath,
		IsDirectory: isDir,
	})
}

func (w *Watcher) isDirectory(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return info.IsDir()
}

func (w *Watcher) debounce(key string, delay time.Duration, fn func()) {
	w.debounceMu.Lock()
	defer w.debounceMu.Unlock()

	if timer, exists := w.debounceTimers[key]; exists {
		timer.Stop()
	}

	w.debounceTimers[key] = time.AfterFunc(delay, func() {
		w.debounceMu.Lock()
		delete(w.debounceTimers, key)
		w.debounceMu.Unlock()
		fn()
	})
}

func (w *Watcher) cancelDebounce(key string) {
	w.debounceMu.Lock()
	defer w.debounceMu.Unlock()

	if timer, exists := w.debounceTimers[key]; exists {
		timer.Stop()
		delete(w.debounceTimers, key)
	}
}

func (w *Watcher) cleanupPendingRenames() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-w.stopCh:
			return
		case <-ticker.C:
			w.renameMu.Lock()
			now := time.Now()
			maxAge := 2 * time.Second

			for path, timestamp := range w.pendingDeletes {
				if now.Sub(timestamp) > maxAge {
					delete(w.pendingDeletes, path)
				}
			}

			for path, timestamp := range w.pendingCreates {
				if now.Sub(timestamp) > maxAge {
					delete(w.pendingCreates, path)
				}
			}
			w.renameMu.Unlock()
		}
	}
}
