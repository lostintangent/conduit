/**
 * A cwd's file system subscription, for the renderer. Each instance subscribes
 * as it's created, which keeps the cwd's watcher running and its events
 * flowing until it's suspended or released.
 *
 * Instances for the same cwd are shared through `FileSystemV2APIService`.
 */

import type { Events } from "@shared/rpc";
import type {
  Cleanup,
  DeleteOptions,
  DirectoryEntry,
  FileStat,
} from "../model";
import { normalizePathForKey } from "@/utils/pathUtils";

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

/** Adds a listener under a key, and drops the key when its last listener leaves. */
function addKeyedListener<T>(
  listenersByKey: Map<string, Set<T>>,
  key: string,
  listener: T,
): Cleanup {
  const listeners = listenersByKey.get(key) ?? new Set<T>();
  listenersByKey.set(key, listeners);
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      listenersByKey.delete(key);
    }
  };
}

/** Calls each listener, so one that throws can't keep the rest from hearing. */
function notify<Args extends unknown[]>(
  listeners: Iterable<(...args: Args) => void> | undefined,
  ...args: Args
): void {
  for (const listener of listeners ?? []) {
    try {
      listener(...args);
    } catch (error) {
      console.error("[FileSystemV2API] Error in listener:", error);
    }
  }
}

/** One instance's listeners, which hear its subscription's events. */
class Listeners {
  /** Directory listing listeners, by normalized path */
  readonly directory = new Map<string, Set<DirectoryListingChangedCallback>>();
  readonly content = new Set<FileContentChangedCallback>();
  readonly deleted = new Set<FileDeletedCallback>();
  readonly renamed = new Set<FileRenamedCallback>();

  clear(): void {
    this.directory.clear();
    this.content.clear();
    this.deleted.clear();
    this.renamed.clear();
  }
}

/** Each live subscription's listeners, by id */
const routes = new Map<string, Listeners>();

let routing = false;

/**
 * Listen once per event for every instance, and route each event to its
 * subscription's listeners, so the number of folders open doesn't add IPC
 * listeners.
 */
function routeEvents(): void {
  if (routing) {
    return;
  }
  routing = true;

  const route = <Event extends keyof Events["files"] & string>(
    event: Event,
    deliver: (listeners: Listeners, payload: Events["files"][Event]) => void,
  ) =>
    window.conduit.files.on(event, (payload) => {
      const listeners = routes.get(payload.subscriptionId);
      if (listeners) {
        deliver(listeners, payload);
      }
    });

  route("directoryListingChanged", (listeners, { path, entries }) =>
    notify(listeners.directory.get(normalizePathForKey(path)), entries),
  );
  route("fileContentChanged", (listeners, { path }) =>
    notify(listeners.content, path),
  );
  route("fileDeleted", (listeners, { path }) =>
    notify(listeners.deleted, path),
  );
  route("fileRenamed", (listeners, { oldPath, newPath }) =>
    notify(listeners.renamed, oldPath, newPath),
  );
}

export class FileSystemV2API {
  /** The working directory this API is scoped to */
  readonly cwd: string;

  /** Active subscription ID, if subscribed to events */
  private subscriptionId: string | null = null;

  /** Pending subscription promise (to prevent duplicate subscription requests) */
  private subscriptionPromise: Promise<void> | null = null;

  private readonly listeners = new Listeners();

  /** Whether the subscription is stopped until `resume()` */
  private suspended = false;

  /** Whether this instance has been released */
  private released = false;

  /**
   * Subscribes eagerly, so events between construction and the first
   * listener aren't missed.
   */
  constructor(cwd: string) {
    this.cwd = cwd;
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
    return window.conduit.files.readDirectory(this.cwd, dirPath);
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
    return window.conduit.files.readFile(filePath);
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
    return window.conduit.files.readTextFile(filePath);
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
    return window.conduit.files.stat(path);
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
    return window.conduit.files.exists(path);
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
    return window.conduit.files.writeFile(this.cwd, filePath, content);
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
    return window.conduit.files.delete(this.cwd, path, options);
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
    return window.conduit.files.rename(this.cwd, oldPath, newPath);
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
    return window.conduit.files.createDirectory(this.cwd, dirPath);
  }

  // ---------------------------------------------------------------------------
  // Event Subscriptions
  // ---------------------------------------------------------------------------

  /** Calls back with a directory's entries each time its listing changes. */
  onDirectoryListingChanged(
    path: string,
    callback: DirectoryListingChangedCallback,
  ): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();
    return addKeyedListener(
      this.listeners.directory,
      normalizePathForKey(path),
      callback,
    );
  }

  /** Calls back with each file whose content changes. */
  onAnyFileContentChanged(callback: FileContentChangedCallback): Cleanup {
    return this.listen(this.listeners.content, callback);
  }

  /** Calls back with each file or directory that's deleted. */
  onAnyFileDeleted(callback: FileDeletedCallback): Cleanup {
    return this.listen(this.listeners.deleted, callback);
  }

  /** Calls back with each file or directory that's renamed or moved. */
  onAnyFileRenamed(callback: FileRenamedCallback): Cleanup {
    return this.listen(this.listeners.renamed, callback);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Unsubscribe until `resume()`. Listeners stay, and hear nothing until then.
   */
  suspend(): void {
    if (this.released || this.suspended) {
      return;
    }
    this.suspended = true;
    this.unsubscribe();
  }

  resume(): void {
    if (this.released || !this.suspended) {
      return;
    }
    this.suspended = false;
    this.ensureSubscribed();
  }

  /** Unsubscribe and drop every listener, after which it can't be used. */
  release(): void {
    if (this.released) {
      return;
    }
    this.released = true;
    this.unsubscribe();
    this.listeners.clear();
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

  private listen<T>(listeners: Set<T>, callback: T): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }

  /** Unsubscribe from the main process, which also releases its provider. */
  private unsubscribe(): void {
    if (this.subscriptionId) {
      routes.delete(this.subscriptionId);
      window.conduit.files.unsubscribe(this.subscriptionId).catch(() => {
        // Ignore errors during cleanup
      });
      this.subscriptionId = null;
    }
  }

  /**
   * Subscribe unless subscribed, subscribing, suspended or released. A
   * suspension or release that lands while the subscription is in flight
   * unsubscribes it as soon as it arrives.
   */
  private ensureSubscribed(): void {
    if (
      this.subscriptionId ||
      this.subscriptionPromise ||
      this.suspended ||
      this.released
    ) {
      return;
    }

    routeEvents();
    this.subscriptionPromise = window.conduit.files
      .subscribe(this.cwd)
      .then((id) => {
        if (this.suspended || this.released) {
          window.conduit.files.unsubscribe(id).catch(() => {
            // Ignore errors during cleanup
          });
          return;
        }
        this.subscriptionId = id;
        routes.set(id, this.listeners);
      })
      .catch((error: unknown) => {
        console.error("[FileSystemV2API] Failed to subscribe:", error);
      })
      .finally(() => {
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
