// Package types defines the core data structures for the filesystem provider.
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
