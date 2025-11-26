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
  DirectoryEntry,
  FileStat,
  DeleteOptions,
  Cleanup,
} from "../../ipc/fsv2/types";
import type {
  DirectoryListingChangedPayload,
  FileContentChangedPayload,
  FileDeletedPayload,
  FileRenamedPayload,
} from "../../preload/window/modules/fsv2";

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
   * @param cwd - Working directory to scope operations to
   */
  constructor(cwd: string) {
    this.cwd = cwd;
    this.setupEventListeners();
  }

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  /**
   * Read contents of a directory.
   *
   * @param dirPath - Absolute path to directory
   * @returns Array of directory entries (sorted: directories first, then files)
   */
  async readDirectory(dirPath: string): Promise<DirectoryEntry[]> {
    this.ensureNotReleased();
    return window.conduit.fsv2.readDirectory(this.cwd, dirPath);
  }

  /**
   * Read file contents as binary data.
   *
   * @param filePath - Absolute path to file
   * @returns File contents as Uint8Array
   */
  async readFile(filePath: string): Promise<Uint8Array> {
    this.ensureNotReleased();
    return window.conduit.fsv2.readFile(this.cwd, filePath);
  }

  /**
   * Read file contents as text.
   *
   * Convenience method that decodes the binary data as UTF-8.
   *
   * @param filePath - Absolute path to file
   * @returns File contents as string
   */
  async readTextFile(filePath: string): Promise<string> {
    const data = await this.readFile(filePath);
    return new TextDecoder().decode(data);
  }

  /**
   * Get file or directory metadata.
   *
   * @param path - Absolute path to file/directory
   * @returns File stats
   */
  async stat(path: string): Promise<FileStat> {
    this.ensureNotReleased();
    return window.conduit.fsv2.stat(this.cwd, path);
  }

  /**
   * Check if a path exists.
   *
   * @param path - Absolute path to check
   * @returns true if path exists
   */
  async exists(path: string): Promise<boolean> {
    this.ensureNotReleased();
    return window.conduit.fsv2.exists(this.cwd, path);
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
   */
  async writeFile(filePath: string, content: Uint8Array): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.fsv2.writeFile(this.cwd, filePath, content);
  }

  /**
   * Write text content to a file.
   *
   * Convenience method that encodes the string as UTF-8.
   *
   * @param filePath - Absolute path to file
   * @param content - File contents as string
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
   */
  async delete(path: string, options?: DeleteOptions): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.fsv2.delete(this.cwd, path, options);
  }

  /**
   * Rename or move a file/directory.
   *
   * @param oldPath - Current absolute path
   * @param newPath - New absolute path
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.fsv2.rename(this.cwd, oldPath, newPath);
  }

  /**
   * Create a directory.
   *
   * Creates parent directories if they don't exist.
   *
   * @param dirPath - Absolute path to create
   */
  async createDirectory(dirPath: string): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.fsv2.createDirectory(this.cwd, dirPath);
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
   */
  onDirectoryListingChanged(
    path: string,
    callback: DirectoryListingChangedCallback,
  ): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();

    let listeners = this.directoryListeners.get(path);
    if (!listeners) {
      listeners = new Set();
      this.directoryListeners.set(path, listeners);
    }
    listeners.add(callback);

    return () => {
      listeners!.delete(callback);
      if (listeners!.size === 0) {
        this.directoryListeners.delete(path);
      }
    };
  }

  /**
   * Subscribe to all directory listing changes (not filtered by path).
   *
   * @param callback - Function called when any directory listing changes
   * @returns Cleanup function to unsubscribe
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
   */
  onFileContentChanged(
    path: string,
    callback: FileContentChangedCallback,
  ): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();

    let listeners = this.fileListeners.get(path);
    if (!listeners) {
      listeners = new Set();
      this.fileListeners.set(path, listeners);
    }
    listeners.add(callback);

    return () => {
      listeners!.delete(callback);
      if (listeners!.size === 0) {
        this.fileListeners.delete(path);
      }
    };
  }

  /**
   * Subscribe to all file content changes (not filtered by path).
   *
   * @param callback - Function called when any file content changes
   * @returns Cleanup function to unsubscribe
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
   */
  onFileDeleted(path: string, callback: FileDeletedCallback): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();

    let listeners = this.deleteListeners.get(path);
    if (!listeners) {
      listeners = new Set();
      this.deleteListeners.set(path, listeners);
    }
    listeners.add(callback);

    return () => {
      listeners!.delete(callback);
      if (listeners!.size === 0) {
        this.deleteListeners.delete(path);
      }
    };
  }

  /**
   * Subscribe to all file deletion events (not filtered by path).
   *
   * @param callback - Function called when any file is deleted
   * @returns Cleanup function to unsubscribe
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
   */
  onFileRenamed(path: string, callback: FileRenamedCallback): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();

    let listeners = this.renameListeners.get(path);
    if (!listeners) {
      listeners = new Set();
      this.renameListeners.set(path, listeners);
    }
    listeners.add(callback);

    return () => {
      listeners!.delete(callback);
      if (listeners!.size === 0) {
        this.renameListeners.delete(path);
      }
    };
  }

  /**
   * Subscribe to all file rename events (not filtered by path).
   *
   * @param callback - Function called when any file is renamed
   * @returns Cleanup function to unsubscribe
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

    // Unsubscribe from main process
    if (this.subscriptionId) {
      window.conduit.fsv2.unsubscribe(this.subscriptionId).catch(() => {
        // Ignore errors during cleanup
      });
      this.subscriptionId = null;
    }

    // Release provider reference
    window.conduit.fsv2.release(this.cwd).catch(() => {
      // Ignore errors during cleanup
    });

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
      window.conduit.fsv2.onDirectoryListingChanged(
        (payload: DirectoryListingChangedPayload) => {
          if (payload.subscriptionId !== this.subscriptionId) {
            return;
          }

          // Notify path-specific listeners
          const listeners = this.directoryListeners.get(payload.path);
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
      window.conduit.fsv2.onFileContentChanged(
        (payload: FileContentChangedPayload) => {
          if (payload.subscriptionId !== this.subscriptionId) {
            return;
          }

          // Notify path-specific listeners
          const listeners = this.fileListeners.get(payload.path);
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
      window.conduit.fsv2.onFileDeleted((payload: FileDeletedPayload) => {
        if (payload.subscriptionId !== this.subscriptionId) {
          return;
        }

        // Notify path-specific listeners
        const listeners = this.deleteListeners.get(payload.path);
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
      window.conduit.fsv2.onFileRenamed((payload: FileRenamedPayload) => {
        if (payload.subscriptionId !== this.subscriptionId) {
          return;
        }

        // Notify path-specific listeners
        const listeners = this.renameListeners.get(payload.oldPath);
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
   */
  private async ensureSubscribed(): Promise<void> {
    if (this.subscriptionId) {
      return;
    }

    this.subscriptionId = await window.conduit.fsv2.subscribe(this.cwd, "all");
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
