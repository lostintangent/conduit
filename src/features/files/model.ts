/**
 * FileSystem Provider v2 - Core Type Definitions
 *
 * This module defines the foundational types for the filesystem abstraction layer.
 * These types are used across the main process (providers), IPC layer, and renderer.
 *
 * Design Philosophy:
 * - Simple over clever: Plain strings for paths (not URIs)
 * - Events include data: Reduces IPC roundtrips
 * - Two file types only: 'file' | 'directory' (no symlinks for now)
 */

import type { Event } from "@shared/types";

// ============================================================================
// Constants
// ============================================================================

/**
 * Entries that are always hidden from directory listings.
 * These are filtered before gitignore checks for performance.
 */
export const ALWAYS_HIDDEN = new Set([".git", "node_modules"]);

// ============================================================================
// Core File System Types
// ============================================================================

/**
 * Metadata about a file or directory.
 *
 * Returned by `stat()` operations. Contains essential metadata
 * needed for file tree rendering and modification tracking.
 */
export interface FileStat {
  /** Whether this is a file or directory */
  type: "file" | "directory";

  /** Size in bytes (0 for directories) */
  size: number;

  /** Last modification time (milliseconds since epoch) */
  mtime: number;

  /** Creation time (milliseconds since epoch) */
  ctime: number;

  /** Whether the file is read-only */
  readonly?: boolean;
}

/**
 * An entry in a directory listing.
 *
 * Intentionally minimal - just name and type.
 * Use `stat()` if you need full metadata.
 */
export interface DirectoryEntry {
  /** File or directory name (not full path) */
  name: string;

  /** Whether this is a file or directory */
  type: "file" | "directory";

  /** Whether this entry is a symbolic link */
  isSymlink: boolean;

  /** Whether this entry is ignored by .gitignore */
  isGitignored?: boolean;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event fired when a directory's contents change.
 *
 * Includes the updated entries for efficiency - the provider
 * already fetched them, so no need for another IPC roundtrip.
 */
export interface DirectoryListingChangedEvent {
  /** Absolute path to the directory that changed */
  path: string;

  /** Updated directory contents (sorted: directories first, then alphabetical) */
  entries: DirectoryEntry[];
}

/**
 * Event fired when a file's contents change externally.
 *
 * Note: Content is NOT included. The consumer should call `readFile()`
 * if they need the updated content. This avoids sending large files
 * over IPC when the consumer might not need them.
 */
export interface FileContentChangedEvent {
  /** Absolute path to the file that changed */
  path: string;
}

/**
 * Event fired when a file or directory is renamed.
 *
 * This is a higher-level abstraction over raw DELETE+CREATE events.
 * The provider correlates these events within a 500ms window to
 * detect renames and moves.
 *
 * Critical for editors: allows updating model URIs without losing
 * editor state (cursor position, undo history, etc.).
 */
export interface FileRenamedEvent {
  /** Original absolute path */
  oldPath: string;

  /** New absolute path after rename/move */
  newPath: string;

  /** Whether a directory was renamed (affects child paths) */
  isDirectory: boolean;
}

/**
 * Event fired when a file or directory is deleted.
 *
 * Used by editors to mark models as "orphaned" and show
 * appropriate UI (e.g., "(deleted)" in tab title).
 */
export interface FileDeletedEvent {
  /** Absolute path to the deleted file/directory */
  path: string;

  /** Whether a directory was deleted */
  isDirectory: boolean;
}

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Options for delete operations.
 */
export interface DeleteOptions {
  /** If true, recursively delete directory contents */
  recursive?: boolean;
}

// Re-export common event system types from shared
export type { Disposable, Event } from "@shared/types";

/**
 * Cleanup function returned by event subscriptions.
 *
 * Call this function to unsubscribe from events.
 * This is a simpler alternative to Disposable for renderer-side callbacks.
 */
export type Cleanup = () => void;

/**
 * The core filesystem provider interface.
 *
 * Provides unified file operations with integrated change watching.
 * All paths are absolute. The provider is scoped to a CWD but can
 * access any path on the filesystem.
 *
 * Key Design Points:
 * 1. Operations are async (return Promises)
 * 2. Events fire automatically when files change
 * 3. Watching is integrated - no separate setup required
 * 4. Provider manages its own lifecycle (watcher, cache, etc.)
 *
 * @example
 * ```typescript
 * const provider = await service.getProvider('/project');
 *
 * // Read directory (automatically sets up watching)
 * const entries = await provider.readDirectory('/project/src');
 *
 * // Subscribe to changes
 * provider.onDirectoryListingChanged((event) => {
 *   console.log('Directory changed:', event.path);
 * });
 * ```
 */
export interface FileSystemProvider {
  /** The current working directory this provider is scoped to */
  readonly cwd: string;

  // -------------------------------------------------------------------------
  // File Operations
  // -------------------------------------------------------------------------

  /**
   * Get metadata for a file or directory.
   * @throws If path does not exist
   */
  stat(path: string): Promise<FileStat>;

  /**
   * List contents of a directory.
   *
   * Returns entries sorted: directories first, then files, alphabetically.
   * Results are cached and automatically invalidated when files change.
   *
   * @throws If dirPath is not a directory or does not exist
   */
  readDirectory(dirPath: string): Promise<DirectoryEntry[]>;

  /**
   * Read complete file contents.
   * @throws If filePath is not a file or does not exist
   */
  readFile(filePath: string): Promise<Uint8Array>;

  /**
   * Write content to a file.
   *
   * Creates the file if it doesn't exist.
   * Creates parent directories if they don't exist.
   */
  writeFile(filePath: string, content: Uint8Array): Promise<void>;

  /**
   * Delete a file or directory.
   *
   * @param options.recursive - Required for non-empty directories
   * @throws If path does not exist or directory is non-empty without recursive
   */
  delete(path: string, options?: DeleteOptions): Promise<void>;

  /**
   * Rename or move a file/directory.
   *
   * @throws If oldPath does not exist or newPath already exists
   */
  rename(oldPath: string, newPath: string): Promise<void>;

  /**
   * Create a directory.
   *
   * Creates parent directories if they don't exist (like `mkdir -p`).
   */
  createDirectory(dirPath: string): Promise<void>;

  /**
   * Check if a path exists.
   *
   * Unlike other methods, this never throws - returns false if not found.
   */
  exists(path: string): Promise<boolean>;

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  /** Fired when directory contents change (files added, removed, renamed) */
  readonly onDirectoryListingChanged: Event<DirectoryListingChangedEvent>;

  /** Fired when a file's content is modified externally */
  readonly onFileContentChanged: Event<FileContentChangedEvent>;

  /** Fired when a file/directory is renamed or moved */
  readonly onFileRenamed: Event<FileRenamedEvent>;

  /** Fired when a file/directory is deleted */
  readonly onFileDeleted: Event<FileDeletedEvent>;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Clean up resources (stop watcher, clear timers, etc.).
   *
   * Called automatically by FileSystemProviderService when reference
   * count drops to zero and grace period expires.
   */
  dispose(): void;
}
