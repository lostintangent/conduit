// Package types defines the core data structures for the sandbox IPC provider.
// These types match the TypeScript interface for API compatibility.
package types

// FileStat contains metadata about a file or directory.
type FileStat struct {
	Type     string `json:"type"`     // "file" or "directory"
	Size     int64  `json:"size"`     // Size in bytes (0 for directories)
	Mtime    int64  `json:"mtime"`    // Last modification time (ms since epoch)
	Ctime    int64  `json:"ctime"`    // Creation time (ms since epoch)
	Readonly bool   `json:"readonly"` // Whether the file is read-only
}

// DirectoryEntry represents an entry in a directory listing.
type DirectoryEntry struct {
	Name string `json:"name"` // File or directory name (not full path)
	Type string `json:"type"` // "file" or "directory"
}

// DirectoryListingChangedEvent is fired when a directory's contents change.
type DirectoryListingChangedEvent struct {
	Path    string           `json:"path"`
	Entries []DirectoryEntry `json:"entries"`
}

// FileContentChangedEvent is fired when a file's contents change.
type FileContentChangedEvent struct {
	Path string `json:"path"`
}

// FileRenamedEvent is fired when a file or directory is renamed.
type FileRenamedEvent struct {
	OldPath     string `json:"oldPath"`
	NewPath     string `json:"newPath"`
	IsDirectory bool   `json:"isDirectory"`
}

// FileDeletedEvent is fired when a file or directory is deleted.
type FileDeletedEvent struct {
	Path        string `json:"path"`
	IsDirectory bool   `json:"isDirectory"`
}

// FileCreatedEvent is fired when a file or directory is created.
type FileCreatedEvent struct {
	Path        string `json:"path"`
	IsDirectory bool   `json:"isDirectory"`
}

// DeleteOptions configures delete operations.
type DeleteOptions struct {
	Recursive bool `json:"recursive"`
}

// FSEvent is a union type for all filesystem events (for SSE).
type FSEvent struct {
	Type string      `json:"type"` // "directoryChanged", "fileChanged", "fileRenamed", "fileDeleted", "fileCreated"
	Data interface{} `json:"data"`
}

// ============================================================================
// Git Types
// ============================================================================

// GitFileStatusCode represents the status of a file in a git repository.
// Maps to git's porcelain status output.
type GitFileStatusCode string

const (
	GitStatusAdded     GitFileStatusCode = "added"     // New file, staged
	GitStatusModified  GitFileStatusCode = "modified"  // Modified from HEAD
	GitStatusDeleted   GitFileStatusCode = "deleted"   // Deleted from working tree
	GitStatusRenamed   GitFileStatusCode = "renamed"   // Renamed (detected by git)
	GitStatusCopied    GitFileStatusCode = "copied"    // Copied (rare)
	GitStatusUntracked GitFileStatusCode = "untracked" // Not tracked by git
	GitStatusIgnored   GitFileStatusCode = "ignored"   // In .gitignore
	GitStatusUnmerged  GitFileStatusCode = "unmerged"  // Merge conflict
)

// GitFileStatus contains status information for a single file.
type GitFileStatus struct {
	Path         string            `json:"path"`                   // Relative path from git root
	Status       GitFileStatusCode `json:"status"`                 // Current status
	Staged       bool              `json:"staged"`                 // Whether staged for commit
	OriginalPath string            `json:"originalPath,omitempty"` // Original path if renamed
}

// GitStatus represents complete repository status.
type GitStatus struct {
	Branch   string                   `json:"branch"`             // Current branch name (or 'HEAD' if detached)
	Upstream string                   `json:"upstream,omitempty"` // Upstream tracking branch
	Ahead    int                      `json:"ahead"`              // Commits ahead of upstream
	Behind   int                      `json:"behind"`             // Commits behind upstream
	Files    map[string]GitFileStatus `json:"files"`              // Map of file paths to status
}

// GitCommit contains information about a git commit.
type GitCommit struct {
	Hash      string   `json:"hash"`      // Full 40-character SHA hash
	ShortHash string   `json:"shortHash"` // Short hash (7 characters)
	Author    string   `json:"author"`    // Author name
	Email     string   `json:"email"`     // Author email
	Date      int64    `json:"date"`      // Commit date (ms since epoch)
	Message   string   `json:"message"`   // Commit message (first line)
	Parents   []string `json:"parents"`   // Parent commit hashes
}

// GitBranch contains information about a git branch.
type GitBranch struct {
	Name              string `json:"name"`                        // Branch name
	IsRemote          bool   `json:"isRemote"`                    // Whether remote-tracking branch
	IsCurrent         bool   `json:"isCurrent"`                   // Whether currently checked-out
	Commit            string `json:"commit"`                      // Commit hash branch points to
	Upstream          string `json:"upstream,omitempty"`          // Upstream tracking branch
	Ahead             int    `json:"ahead,omitempty"`             // Commits ahead of upstream
	Behind            int    `json:"behind,omitempty"`            // Commits behind upstream
	LastCommitDate    int64  `json:"lastCommitDate,omitempty"`    // Date of last commit (ms since epoch)
	LastCommitMessage string `json:"lastCommitMessage,omitempty"` // Message of last commit
}

// GitDiffStats contains statistics about changes.
type GitDiffStats struct {
	Added   int `json:"added"`   // Lines added
	Removed int `json:"removed"` // Lines removed
	Files   int `json:"files"`   // Number of files changed
}

// GitCommitOptions configures commit creation.
type GitCommitOptions struct {
	Files   []string `json:"files,omitempty"` // Specific files to commit
	Amend   bool     `json:"amend,omitempty"` // Amend previous commit
	Signoff bool     `json:"signoff,omitempty"` // Add Signed-off-by
}

// ============================================================================
// Git Events
// ============================================================================

// GitStatusChangedEvent is fired when git status changes.
type GitStatusChangedEvent struct {
	Status   GitStatus `json:"status"`   // Complete current status
	Added    []string  `json:"added"`    // Files added since last status
	Modified []string  `json:"modified"` // Files whose status changed
	Removed  []string  `json:"removed"`  // Files no longer in changed state
}

// GitBranchChangedEvent is fired when the current branch changes.
type GitBranchChangedEvent struct {
	PreviousBranch string `json:"previousBranch"`
	CurrentBranch  string `json:"currentBranch"`
}

// GitCommitCreatedEvent is fired when a commit is created.
type GitCommitCreatedEvent struct {
	Commit GitCommit `json:"commit"`
}

// GitHeadChangedEvent is fired when HEAD changes.
type GitHeadChangedEvent struct {
	PreviousHead   string `json:"previousHead"`
	CurrentHead    string `json:"currentHead"`
	IsBranchSwitch bool   `json:"isBranchSwitch"`
}
