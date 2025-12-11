package git

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"sandbox-conduit-server/types"

	"github.com/fsnotify/fsnotify"
)

const (
	// StatusRefreshDebounceMs is the delay before refreshing status after a change
	StatusRefreshDebounceMs = 100
)

// IgnoredGitPaths contains paths within .git/ to ignore when watching.
// We only care about files that indicate meaningful status changes.
var IgnoredGitPaths = []string{
	"objects",   // Object database, changes constantly
	"logs",      // Reflog, updates on every operation
	"hooks",     // Scripts, never affects status
	"info",      // Exclude patterns, sparse checkout
	".lock",     // Temporary lock files
	"COMMIT_EDITMSG",
	"FETCH_HEAD",
	"ORIG_HEAD",
	"MERGE_MSG",
	"SQUASH_MSG",
	"AUTO_MERGE",
	"packed-refs",
	"shallow",
	"commondir",
	"gitdir",
	"description",
	"config",
}

// EventHandler receives git events.
type EventHandler interface {
	OnStatusChanged(event types.GitStatusChangedEvent)
	OnBranchChanged(event types.GitBranchChangedEvent)
	OnHeadChanged(event types.GitHeadChangedEvent)
}

// Watcher watches the .git directory for changes and emits events.
type Watcher struct {
	gitRoot  string
	provider *Provider
	handler  EventHandler

	watcher     *fsnotify.Watcher
	refreshCh   chan struct{}
	stopCh      chan struct{}
	mu          sync.Mutex
	refreshTimer *time.Timer
	running     bool

	// Last known state for change detection
	lastStatus *types.GitStatus
	lastBranch string
	lastHead   string
}

// NewWatcher creates a new git watcher.
func NewWatcher(gitRoot string, provider *Provider, handler EventHandler) (*Watcher, error) {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	return &Watcher{
		gitRoot:   gitRoot,
		provider:  provider,
		handler:   handler,
		watcher:   w,
		refreshCh: make(chan struct{}, 1),
		stopCh:    make(chan struct{}),
	}, nil
}

// Start begins watching the .git directory.
func (w *Watcher) Start() error {
	w.mu.Lock()
	if w.running {
		w.mu.Unlock()
		return nil
	}
	w.running = true
	w.mu.Unlock()

	gitDir := filepath.Join(w.gitRoot, ".git")

	// Check if .git is a file (worktree) or directory
	info, err := os.Stat(gitDir)
	if err != nil {
		return err
	}

	var watchPath string
	if info.IsDir() {
		watchPath = gitDir
	} else {
		// It's a worktree, read the actual git dir path
		content, err := os.ReadFile(gitDir)
		if err != nil {
			return err
		}
		// Format: "gitdir: /path/to/.git/worktrees/name"
		gitDirPath := strings.TrimSpace(string(content))
		if strings.HasPrefix(gitDirPath, "gitdir: ") {
			watchPath = strings.TrimPrefix(gitDirPath, "gitdir: ")
		} else {
			watchPath = gitDir
		}
	}

	// Watch key files in .git directory
	filesToWatch := []string{
		filepath.Join(watchPath, "index"),   // Staging area
		filepath.Join(watchPath, "HEAD"),    // Current branch
		filepath.Join(watchPath, "refs"),    // Branch refs
	}

	for _, file := range filesToWatch {
		if _, err := os.Stat(file); err == nil {
			w.watcher.Add(file)
		}
	}

	// Watch refs/heads for branch changes
	refsHeads := filepath.Join(watchPath, "refs", "heads")
	if _, err := os.Stat(refsHeads); err == nil {
		w.watcher.Add(refsHeads)
	}

	// Initialize last known state
	w.initializeState()

	// Start event processing
	go w.processEvents()

	return nil
}

// Stop stops watching.
func (w *Watcher) Stop() error {
	w.mu.Lock()
	if !w.running {
		w.mu.Unlock()
		return nil
	}
	w.running = false
	w.mu.Unlock()

	close(w.stopCh)
	return w.watcher.Close()
}

// TriggerRefresh forces a status refresh (called when working tree changes).
func (w *Watcher) TriggerRefresh() {
	w.scheduleRefresh()
}

// IsRunning returns whether the watcher is running.
func (w *Watcher) IsRunning() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.running
}

// processEvents handles fsnotify events.
func (w *Watcher) processEvents() {
	for {
		select {
		case <-w.stopCh:
			return
		case event, ok := <-w.watcher.Events:
			if !ok {
				return
			}
			// Check if this is a path we care about
			if !w.shouldIgnore(event.Name) {
				w.scheduleRefresh()
			}
		case err, ok := <-w.watcher.Errors:
			if !ok {
				return
			}
			_ = err // Log if needed
		case <-w.refreshCh:
			w.doRefresh()
		}
	}
}

// shouldIgnore checks if a path should be ignored.
func (w *Watcher) shouldIgnore(path string) bool {
	for _, ignored := range IgnoredGitPaths {
		if strings.Contains(path, ignored) {
			return true
		}
	}
	return false
}

// scheduleRefresh schedules a debounced status refresh.
func (w *Watcher) scheduleRefresh() {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.refreshTimer != nil {
		w.refreshTimer.Stop()
	}

	w.refreshTimer = time.AfterFunc(StatusRefreshDebounceMs*time.Millisecond, func() {
		select {
		case w.refreshCh <- struct{}{}:
		default:
			// Channel full, refresh already pending
		}
	})
}

// doRefresh performs the actual status refresh.
func (w *Watcher) doRefresh() {
	// Get current state
	status, err := w.provider.GetStatus()
	if err != nil {
		return
	}

	branch, _ := w.provider.GetCurrentBranch()
	head := w.getHeadCommit()

	// Check for status changes
	if w.lastStatus != nil {
		added, modified, removed := w.diffStatus(w.lastStatus, status)
		if len(added) > 0 || len(modified) > 0 || len(removed) > 0 {
			w.handler.OnStatusChanged(types.GitStatusChangedEvent{
				Status:   *status,
				Added:    added,
				Modified: modified,
				Removed:  removed,
			})
		}
	}

	// Check for branch change
	if w.lastBranch != "" && w.lastBranch != branch {
		w.handler.OnBranchChanged(types.GitBranchChangedEvent{
			PreviousBranch: w.lastBranch,
			CurrentBranch:  branch,
		})
	}

	// Check for HEAD change
	if w.lastHead != "" && w.lastHead != head {
		w.handler.OnHeadChanged(types.GitHeadChangedEvent{
			PreviousHead:   w.lastHead,
			CurrentHead:    head,
			IsBranchSwitch: w.lastBranch != branch,
		})
	}

	// Update last known state
	w.lastStatus = status
	w.lastBranch = branch
	w.lastHead = head
}

// initializeState sets up initial state for change detection.
func (w *Watcher) initializeState() {
	status, err := w.provider.GetStatus()
	if err == nil {
		w.lastStatus = status
	}
	w.lastBranch, _ = w.provider.GetCurrentBranch()
	w.lastHead = w.getHeadCommit()
}

// getHeadCommit returns the current HEAD commit hash.
func (w *Watcher) getHeadCommit() string {
	output, err := w.provider.runGit("rev-parse", "HEAD")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(output)
}

// diffStatus compares two status snapshots and returns the changes.
func (w *Watcher) diffStatus(old, new *types.GitStatus) (added, modified, removed []string) {
	if old == nil || new == nil {
		return
	}

	// Files in new but not in old = added
	// Files in both with different status = modified
	for path, newStatus := range new.Files {
		if oldStatus, ok := old.Files[path]; ok {
			if oldStatus.Status != newStatus.Status || oldStatus.Staged != newStatus.Staged {
				modified = append(modified, path)
			}
		} else {
			added = append(added, path)
		}
	}

	// Files in old but not in new = removed
	for path := range old.Files {
		if _, ok := new.Files[path]; !ok {
			removed = append(removed, path)
		}
	}

	return
}
