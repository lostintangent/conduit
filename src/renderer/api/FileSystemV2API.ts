/**
 * FileSystem v2 Renderer API
 *
 * High-level API for filesystem operations in the renderer process.
 * Provides CWD-scoped operations with automatic subscription management.
 *
 * This class wraps the low-level IPC methods exposed by the preload script,
 * adding:
 * - Automatic subscription tracking and cleanup
 * - Type-safe event handlers
 * - Reference lifecycle management
 *
 * @example
 * ```typescript
 * // Create an instance for a project directory
 * const fs = new FileSystemV2API('/path/to/project');
 *
 * // Read directory contents
 * const entries = await fs.readDirectory('/path/to/project/src');
 *
 * // Subscribe to changes
 * const cleanup = fs.onDirectoryListingChanged('/path/to/project/src', (entries) => {
 *   console.log('Directory listing changed:', entries.length, 'entries');
 * });
 *
 * // When done, release resources
 * fs.release();
 * ```
 */

import type {
  Cleanup,
  DeleteOptions,
  DirectoryEntry,
  FileStat,
} from "../../ipc/fs/types";
import type {
  DirectoryListingChangedPayload,
  FileContentChangedPayload,
  FileDeletedPayload,
  FileRenamedPayload,
} from "../../preload/window/modules/fs";
import { normalizePathForKey } from "../utils/pathUtils";

// ============================================================================
// Types
// ============================================================================

/**
 * Callback for directory listing change events.
 */
export type DirectoryListingChangedCallback = (
  entries: DirectoryEntry[],
) => void;

/**
 * Callback for file content change events.
 */
export type FileContentChangedCallback = (path: string) => void;

/**
 * Callback for file delete events.
 */
export type FileDeletedCallback = (path: string) => void;

/**
 * Callback for file rename events.
 */
export type FileRenamedCallback = (oldPath: string, newPath: string) => void;

// Re-export Cleanup from shared types for convenience
export type { Cleanup };

// ============================================================================
// FileSystemV2API Class
// ============================================================================

/**
 * High-level filesystem API for the renderer process.
 *
 * All operations are scoped to the CWD provided at construction.
 * Manages subscriptions automatically and cleans up on release.
 */
export class FileSystemV2API {
  /** The working directory this API is scoped to */
  readonly cwd: string;

  /** Active subscription ID, if subscribed to events */
  private subscriptionId: string | null = null;

  /** Pending subscription promise (to prevent duplicate subscription requests) */
  private subscriptionPromise: Promise<void> | null = null;

  /** Listeners registered for directory listing changes */
  private directoryListeners: Map<
    string,
    Set<DirectoryListingChangedCallback>
  > = new Map();

  /** Listeners registered for file content changes */
  private fileListeners: Map<string, Set<FileContentChangedCallback>> =
    new Map();

  /** Listeners registered for file deletions */
  private deleteListeners: Map<string, Set<FileDeletedCallback>> = new Map();

  /** Listeners registered for file renames (keyed by oldPath) */
  private renameListeners: Map<string, Set<FileRenamedCallback>> = new Map();

  /** Global listeners (not filtered by path) */
  private globalDirectoryListeners: Set<
    (path: string, entries: DirectoryEntry[]) => void
  > = new Set();
  private globalFileListeners: Set<FileContentChangedCallback> = new Set();
  private globalDeleteListeners: Set<FileDeletedCallback> = new Set();
  private globalRenameListeners: Set<FileRenamedCallback> = new Set();

  /** Cleanup functions for IPC event listeners */
  private ipcCleanups: Cleanup[] = [];

  /** Whether this instance has been released */
  private released = false;

  /**
   * Create a new FileSystemV2API instance.
   *
   * Eagerly subscribes to file system events to minimize the window
   * for missed events between construction and first listener registration.
   *
   * @param cwd - Working directory to scope operations to
   */
  constructor(cwd: string) {
    this.cwd = cwd;
    this.setupEventListeners();
    // Eagerly subscribe to reduce race condition window
    this.ensureSubscribed();
  }

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  /**
   * Read contents of a directory.
   *
   * @param dirPath - Absolute path to directory
   * @returns Array of directory entries (sorted: directories first, then files)
   * @throws {Error} If the API has been released
   * @throws {Error} If the directory does not exist or is not accessible
   */
  async readDirectory(dirPath: string): Promise<DirectoryEntry[]> {
    this.ensureNotReleased();
    return window.conduit.fs.readDirectory(this.cwd, dirPath);
  }

  /**
   * Read file contents as binary data.
   *
   * @param filePath - Absolute path to file
   * @returns File contents as Uint8Array
   * @throws {Error} If the API has been released
   * @throws {Error} If the file does not exist or is not accessible
   */
  async readFile(filePath: string): Promise<Uint8Array> {
    this.ensureNotReleased();
    return window.conduit.fs.readFile(this.cwd, filePath);
  }

  /**
   * Read file contents as text (UTF-8).
   *
   * Convenience method for text files that avoids the need for
   * TextDecoder on the caller side. The main benefit is eliminating
   * duplicate file reads - Monaco model registry uses this directly.
   *
   * Note: Only use for known text files. Binary files will have invalid
   * UTF-8 bytes replaced with the Unicode replacement character (U+FFFD).
   *
   * @param filePath - Absolute path to file
   * @returns File contents as string
   * @throws {Error} If the API has been released
   * @throws {Error} If the file does not exist or is not accessible
   */
  async readTextFile(filePath: string): Promise<string> {
    this.ensureNotReleased();
    return window.conduit.fs.readTextFile(this.cwd, filePath);
  }

  /**
   * Get file or directory metadata.
   *
   * @param path - Absolute path to file/directory
   * @returns File stats
   * @throws {Error} If the API has been released
   * @throws {Error} If the path does not exist or is not accessible
   */
  async stat(path: string): Promise<FileStat> {
    this.ensureNotReleased();
    return window.conduit.fs.stat(this.cwd, path);
  }

  /**
   * Check if a path exists.
   *
   * @param path - Absolute path to check
   * @returns true if path exists
   * @throws {Error} If the API has been released
   */
  async exists(path: string): Promise<boolean> {
    this.ensureNotReleased();
    return window.conduit.fs.exists(this.cwd, path);
  }

  // ---------------------------------------------------------------------------
  // Write Operations
  // ---------------------------------------------------------------------------

  /**
   * Write binary content to a file.
   *
   * Creates the file if it doesn't exist.
   * Creates parent directories if they don't exist.
   *
   * @param filePath - Absolute path to file
   * @param content - File contents as Uint8Array
   * @throws {Error} If the API has been released
   * @throws {Error} If the write fails (permission denied, disk full, etc.)
   */
  async writeFile(filePath: string, content: Uint8Array): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.fs.writeFile(this.cwd, filePath, content);
  }

  /**
   * Write text content to a file.
   *
   * Convenience method that encodes the string as UTF-8.
   *
   * @param filePath - Absolute path to file
   * @param content - File contents as string
   * @throws {Error} If the API has been released
   * @throws {Error} If the write fails (permission denied, disk full, etc.)
   */
  async writeTextFile(filePath: string, content: string): Promise<void> {
    const data = new TextEncoder().encode(content);
    return this.writeFile(filePath, data);
  }

  /**
   * Delete a file or directory.
   *
   * @param path - Absolute path to delete
   * @param options - Delete options (recursive for directories)
   * @throws {Error} If the API has been released
   * @throws {Error} If the path does not exist or cannot be deleted
   */
  async delete(path: string, options?: DeleteOptions): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.fs.delete(this.cwd, path, options);
  }

  /**
   * Rename or move a file/directory.
   *
   * @param oldPath - Current absolute path
   * @param newPath - New absolute path
   * @throws {Error} If the API has been released
   * @throws {Error} If the source does not exist or rename fails
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.fs.rename(this.cwd, oldPath, newPath);
  }

  /**
   * Create a directory.
   *
   * Creates parent directories if they don't exist.
   *
   * @param dirPath - Absolute path to create
   * @throws {Error} If the API has been released
   * @throws {Error} If directory creation fails (permission denied, etc.)
   */
  async createDirectory(dirPath: string): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.fs.createDirectory(this.cwd, dirPath);
  }

  // ---------------------------------------------------------------------------
  // Event Subscriptions
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to directory listing changes.
   *
   * @param path - Directory path to watch
   * @param callback - Function called when directory listing changes
   * @returns Cleanup function to unsubscribe
   * @throws {Error} If the API has been released
   */
  onDirectoryListingChanged(
    path: string,
    callback: DirectoryListingChangedCallback,
  ): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();

    const key = normalizePathForKey(path);
    let listeners = this.directoryListeners.get(key);
    if (!listeners) {
      listeners = new Set();
      this.directoryListeners.set(key, listeners);
    }
    listeners.add(callback);

    return () => {
      listeners!.delete(callback);
      if (listeners!.size === 0) {
        this.directoryListeners.delete(key);
      }
    };
  }

  /**
   * Subscribe to all directory listing changes (not filtered by path).
   *
   * @param callback - Function called when any directory listing changes
   * @returns Cleanup function to unsubscribe
   * @throws {Error} If the API has been released
   */
  onAnyDirectoryListingChanged(
    callback: (path: string, entries: DirectoryEntry[]) => void,
  ): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();

    this.globalDirectoryListeners.add(callback);

    return () => {
      this.globalDirectoryListeners.delete(callback);
    };
  }

  /**
   * Subscribe to file content changes.
   *
   * @param path - File path to watch
   * @param callback - Function called when file content changes
   * @returns Cleanup function to unsubscribe
   * @throws {Error} If the API has been released
   */
  onFileContentChanged(
    path: string,
    callback: FileContentChangedCallback,
  ): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();

    const key = normalizePathForKey(path);
    let listeners = this.fileListeners.get(key);
    if (!listeners) {
      listeners = new Set();
      this.fileListeners.set(key, listeners);
    }
    listeners.add(callback);

    return () => {
      listeners!.delete(callback);
      if (listeners!.size === 0) {
        this.fileListeners.delete(key);
      }
    };
  }

  /**
   * Subscribe to all file content changes (not filtered by path).
   *
   * @param callback - Function called when any file content changes
   * @returns Cleanup function to unsubscribe
   * @throws {Error} If the API has been released
   */
  onAnyFileContentChanged(callback: FileContentChangedCallback): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();

    this.globalFileListeners.add(callback);

    return () => {
      this.globalFileListeners.delete(callback);
    };
  }

  /**
   * Subscribe to file deletion events.
   *
   * @param path - File path to watch
   * @param callback - Function called when file is deleted
   * @returns Cleanup function to unsubscribe
   * @throws {Error} If the API has been released
   */
  onFileDeleted(path: string, callback: FileDeletedCallback): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();

    const key = normalizePathForKey(path);
    let listeners = this.deleteListeners.get(key);
    if (!listeners) {
      listeners = new Set();
      this.deleteListeners.set(key, listeners);
    }
    listeners.add(callback);

    return () => {
      listeners!.delete(callback);
      if (listeners!.size === 0) {
        this.deleteListeners.delete(key);
      }
    };
  }

  /**
   * Subscribe to all file deletion events (not filtered by path).
   *
   * @param callback - Function called when any file is deleted
   * @returns Cleanup function to unsubscribe
   * @throws {Error} If the API has been released
   */
  onAnyFileDeleted(callback: FileDeletedCallback): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();

    this.globalDeleteListeners.add(callback);

    return () => {
      this.globalDeleteListeners.delete(callback);
    };
  }

  /**
   * Subscribe to file rename events.
   *
   * @param path - Original file path to watch
   * @param callback - Function called when file is renamed
   * @returns Cleanup function to unsubscribe
   * @throws {Error} If the API has been released
   */
  onFileRenamed(path: string, callback: FileRenamedCallback): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();
    const key = normalizePathForKey(path);

    let listeners = this.renameListeners.get(key);
    if (!listeners) {
      listeners = new Set();
      this.renameListeners.set(key, listeners);
    }
    listeners.add(callback);

    return () => {
      listeners!.delete(callback);
      if (listeners!.size === 0) {
        this.renameListeners.delete(key);
      }
    };
  }

  /**
   * Subscribe to all file rename events (not filtered by path).
   *
   * @param callback - Function called when any file is renamed
   * @returns Cleanup function to unsubscribe
   * @throws {Error} If the API has been released
   */
  onAnyFileRenamed(callback: FileRenamedCallback): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();

    this.globalRenameListeners.add(callback);

    return () => {
      this.globalRenameListeners.delete(callback);
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Release all resources held by this API instance.
   *
   * After calling this, the instance cannot be used.
   * All event subscriptions are automatically cleaned up.
   */
  release(): void {
    if (this.released) {
      return;
    }

    this.released = true;

    // Clean up IPC event listeners
    for (const cleanup of this.ipcCleanups) {
      cleanup();
    }
    this.ipcCleanups = [];

    // Unsubscribe from main process (this also releases the provider reference)
    if (this.subscriptionId) {
      window.conduit.fs.unsubscribe(this.subscriptionId).catch(() => {
        // Ignore errors during cleanup
      });
      this.subscriptionId = null;
    }

    // Clear all listeners
    this.directoryListeners.clear();
    this.fileListeners.clear();
    this.deleteListeners.clear();
    this.renameListeners.clear();
    this.globalDirectoryListeners.clear();
    this.globalFileListeners.clear();
    this.globalDeleteListeners.clear();
    this.globalRenameListeners.clear();
  }

  /**
   * Check if this instance has been released.
   */
  get isReleased(): boolean {
    return this.released;
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * Set up IPC event listeners.
   */
  private setupEventListeners(): void {
    // Directory listing changes
    this.ipcCleanups.push(
      window.conduit.fs.onDirectoryListingChanged(
        (payload: DirectoryListingChangedPayload) => {
          if (payload.subscriptionId !== this.subscriptionId) {
            return;
          }

          // Notify path-specific listeners (use normalized key for lookup)
          const key = normalizePathForKey(payload.path);
          const listeners = this.directoryListeners.get(key);
          if (listeners) {
            for (const callback of listeners) {
              try {
                callback(payload.entries);
              } catch (error) {
                console.error(
                  "[FileSystemV2API] Error in directory listener:",
                  error,
                );
              }
            }
          }

          // Notify global listeners
          for (const callback of this.globalDirectoryListeners) {
            try {
              callback(payload.path, payload.entries);
            } catch (error) {
              console.error(
                "[FileSystemV2API] Error in global directory listener:",
                error,
              );
            }
          }
        },
      ),
    );

    // File content changes
    this.ipcCleanups.push(
      window.conduit.fs.onFileContentChanged(
        (payload: FileContentChangedPayload) => {
          if (payload.subscriptionId !== this.subscriptionId) {
            return;
          }

          // Notify path-specific listeners (use normalized key for lookup)
          const fileKey = normalizePathForKey(payload.path);
          const listeners = this.fileListeners.get(fileKey);
          if (listeners) {
            for (const callback of listeners) {
              try {
                callback(payload.path);
              } catch (error) {
                console.error(
                  "[FileSystemV2API] Error in file listener:",
                  error,
                );
              }
            }
          }

          // Notify global listeners
          for (const callback of this.globalFileListeners) {
            try {
              callback(payload.path);
            } catch (error) {
              console.error(
                "[FileSystemV2API] Error in global file listener:",
                error,
              );
            }
          }
        },
      ),
    );

    // File deletions
    this.ipcCleanups.push(
      window.conduit.fs.onFileDeleted((payload: FileDeletedPayload) => {
        if (payload.subscriptionId !== this.subscriptionId) {
          return;
        }

        // Notify path-specific listeners (use normalized key for lookup)
        const deleteKey = normalizePathForKey(payload.path);
        const listeners = this.deleteListeners.get(deleteKey);
        if (listeners) {
          for (const callback of listeners) {
            try {
              callback(payload.path);
            } catch (error) {
              console.error(
                "[FileSystemV2API] Error in delete listener:",
                error,
              );
            }
          }
        }

        // Notify global listeners
        for (const callback of this.globalDeleteListeners) {
          try {
            callback(payload.path);
          } catch (error) {
            console.error(
              "[FileSystemV2API] Error in global delete listener:",
              error,
            );
          }
        }
      }),
    );

    // File renames
    this.ipcCleanups.push(
      window.conduit.fs.onFileRenamed((payload: FileRenamedPayload) => {
        if (payload.subscriptionId !== this.subscriptionId) {
          return;
        }

        // Notify path-specific listeners (use normalized key for lookup)
        const renameKey = normalizePathForKey(payload.oldPath);
        const listeners = this.renameListeners.get(renameKey);
        if (listeners) {
          for (const callback of listeners) {
            try {
              callback(payload.oldPath, payload.newPath);
            } catch (error) {
              console.error(
                "[FileSystemV2API] Error in rename listener:",
                error,
              );
            }
          }
        }

        // Notify global listeners
        for (const callback of this.globalRenameListeners) {
          try {
            callback(payload.oldPath, payload.newPath);
          } catch (error) {
            console.error(
              "[FileSystemV2API] Error in global rename listener:",
              error,
            );
          }
        }
      }),
    );
  }

  /**
   * Ensure we have an active subscription to the main process.
   *
   * Uses a promise to prevent multiple concurrent subscription requests.
   * If a subscription is already in progress, returns the existing promise.
   * Also handles the race condition where release() is called while the
   * subscription IPC is in flight - in that case, immediately unsubscribes.
   */
  private ensureSubscribed(): void {
    // Already subscribed
    if (this.subscriptionId) {
      return;
    }

    // Subscription already in progress - don't start another
    if (this.subscriptionPromise) {
      return;
    }

    // Start subscription
    this.subscriptionPromise = window.conduit.fs
      .subscribe(this.cwd, "all")
      .then((id: string) => {
        // Check if we were released while waiting for the subscription
        // This handles the race condition where release() is called
        // before the IPC completes
        if (this.released) {
          // Immediately unsubscribe since we're already released
          window.conduit.fs.unsubscribe(id).catch(() => {
            // Ignore errors during cleanup
          });
          this.subscriptionPromise = null;
          return;
        }
        this.subscriptionId = id;
        this.subscriptionPromise = null;
      })
      .catch((error: unknown) => {
        console.error("[FileSystemV2API] Failed to subscribe:", error);
        this.subscriptionPromise = null;
      });
  }

  /**
   * Throw if this instance has been released.
   */
  private ensureNotReleased(): void {
    if (this.released) {
      throw new Error("FileSystemV2API has been released and cannot be used");
    }
  }
}
