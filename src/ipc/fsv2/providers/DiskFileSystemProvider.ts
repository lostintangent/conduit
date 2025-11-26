/**
 * DiskFileSystemProvider - Filesystem provider for local disk operations.
 *
 * This is the core implementation of the FileSystemProvider interface,
 * providing unified file operations with integrated watching and caching.
 *
 * Key Features:
 * 1. **Integrated Watching**: Uses ParcelFileWatcher for real-time change detection
 * 2. **Smart Caching**: Uses DirectoryCache with automatic invalidation
 * 3. **Event-Driven**: Emits semantic events for all file changes
 * 4. **Debounced Updates**: Prevents event storms during rapid changes
 * 5. **Background Prefetching**: Prefetches child directories for instant navigation
 *
 * Architecture:
 * ```
 * DiskFileSystemProvider
 * ├── ParcelFileWatcher (change detection)
 * ├── DirectoryCache (performance)
 * └── EventEmitters (notifications)
 * ```
 *
 * @see docs/architecture/filesystem-provider-design-narrative.md
 */

import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";

import { EventEmitter } from "../utils/EventEmitter";
import { DirectoryCache } from "../cache/DirectoryCache";
import {
  ParcelFileWatcher,
  type ParcelFileWatcherOptions,
} from "../watcher/ParcelFileWatcher";
import type {
  FileSystemProvider,
  FileStat,
  DirectoryEntry,
  DirectoryListingChangedEvent,
  FileContentChangedEvent,
  FileRenamedEvent,
  FileDeletedEvent,
  DeleteOptions,
  Event,
} from "../types";

// ============================================================================
// Constants
// ============================================================================

/** Delay before refreshing a directory listing after a change (ms) */
const REFRESH_DEBOUNCE_MS = 50;

/** Maximum concurrent prefetch operations */
const MAX_CONCURRENT_PREFETCH = 10;

/** Cooldown between cache verification checks for the same directory (ms) */
const VERIFY_CACHE_COOLDOWN_MS = 2000;

// ============================================================================
// DiskFileSystemProvider
// ============================================================================

/**
 * Filesystem provider implementation for local disk operations.
 *
 * @example
 * ```typescript
 * const provider = new DiskFileSystemProvider('/project/src');
 *
 * // Read directory (cached after first read)
 * const entries = await provider.readDirectory('/project/src');
 *
 * // Subscribe to changes
 * provider.onDirectoryListingChanged((event) => {
 *   console.log('Directory changed:', event.path);
 *   console.log('New entries:', event.entries);
 * });
 *
 * // File operations
 * await provider.writeFile('/project/src/new.ts', Buffer.from('// code'));
 * const content = await provider.readFile('/project/src/new.ts');
 *
 * // Cleanup
 * provider.dispose();
 * ```
 */
export class DiskFileSystemProvider implements FileSystemProvider {
  readonly cwd: string;

  // -------------------------------------------------------------------------
  // Internal Components
  // -------------------------------------------------------------------------

  private watcher: ParcelFileWatcher;
  private disposed = false;

  /** Pending directory refresh timers (debouncing) */
  private refreshTimers = new Map<string, NodeJS.Timeout>();

  /** Currently running prefetch operations */
  private activePrefetches = new Set<string>();

  /** Last verification time per directory (for cooldown) */
  private lastVerifyTime = new Map<string, number>();

  // -------------------------------------------------------------------------
  // Event Emitters
  // -------------------------------------------------------------------------

  private readonly _onDirectoryListingChanged =
    new EventEmitter<DirectoryListingChangedEvent>();
  private readonly _onFileContentChanged =
    new EventEmitter<FileContentChangedEvent>();
  private readonly _onFileRenamed = new EventEmitter<FileRenamedEvent>();
  private readonly _onFileDeleted = new EventEmitter<FileDeletedEvent>();

  readonly onDirectoryListingChanged: Event<DirectoryListingChangedEvent> =
    this._onDirectoryListingChanged.event;
  readonly onFileContentChanged: Event<FileContentChangedEvent> =
    this._onFileContentChanged.event;
  readonly onFileRenamed: Event<FileRenamedEvent> = this._onFileRenamed.event;
  readonly onFileDeleted: Event<FileDeletedEvent> = this._onFileDeleted.event;

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  /**
   * Create a new disk filesystem provider.
   *
   * @param cwd - The working directory to scope this provider to
   * @param watcherOptions - Optional configuration for the file watcher
   */
  constructor(cwd: string, watcherOptions?: ParcelFileWatcherOptions) {
    this.cwd = path.resolve(cwd);

    // Initialize watcher and wire up events
    this.watcher = new ParcelFileWatcher(this.cwd, watcherOptions);
    this.setupWatcherEvents();
  }

  // -------------------------------------------------------------------------
  // File Operations
  // -------------------------------------------------------------------------

  /**
   * Get metadata for a file or directory.
   */
  async stat(filePath: string): Promise<FileStat> {
    const stats = await fs.stat(filePath);

    return {
      type: stats.isDirectory() ? "directory" : "file",
      size: stats.size,
      mtime: stats.mtimeMs,
      ctime: stats.ctimeMs,
      readonly: this.isReadonly(stats),
    };
  }

  /**
   * List contents of a directory.
   *
   * Uses cache-first strategy:
   * 1. Return cached entries immediately if available
   * 2. Fetch from disk in background and update cache
   * 3. Emit event if entries changed
   */
  async readDirectory(dirPath: string): Promise<DirectoryEntry[]> {
    const normalizedPath = path.resolve(dirPath);

    // Check cache first
    const cached = DirectoryCache.get(normalizedPath);
    if (cached) {
      // Trigger background verification (with cooldown)
      this.scheduleVerifyCache(normalizedPath);
      return cached.entries;
    }

    // Cache miss - read from disk
    const entries = await this.readDirectoryFromDisk(normalizedPath);

    // Cache the result
    DirectoryCache.set(normalizedPath, entries);

    // Prefetch child directories in background
    this.prefetchChildren(normalizedPath, entries);

    return entries;
  }

  /**
   * Read complete file contents.
   */
  async readFile(filePath: string): Promise<Uint8Array> {
    const buffer = await fs.readFile(filePath);
    return new Uint8Array(buffer);
  }

  /**
   * Write content to a file.
   *
   * Creates parent directories if they don't exist.
   */
  async writeFile(filePath: string, content: Uint8Array): Promise<void> {
    // Ensure parent directory exists
    const parentDir = path.dirname(filePath);
    await fs.mkdir(parentDir, { recursive: true });

    // Write the file
    await fs.writeFile(filePath, content);
  }

  /**
   * Delete a file or directory.
   */
  async delete(filePath: string, options?: DeleteOptions): Promise<void> {
    await fs.rm(filePath, {
      recursive: options?.recursive ?? false,
      force: false,
    });
  }

  /**
   * Rename or move a file/directory.
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    // Ensure parent directory of new path exists
    const parentDir = path.dirname(newPath);
    await fs.mkdir(parentDir, { recursive: true });

    await fs.rename(oldPath, newPath);
  }

  /**
   * Create a directory.
   *
   * Creates parent directories if they don't exist (like `mkdir -p`).
   */
  async createDirectory(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  /**
   * Check if a path exists.
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start watching for file changes.
   *
   * Call this after setting up event listeners.
   */
  async startWatching(): Promise<void> {
    if (!this.disposed) {
      await this.watcher.watch();
    }
  }

  /**
   * Check if currently watching for changes.
   */
  isWatching(): boolean {
    return this.watcher.isWatching();
  }

  /**
   * Clean up all resources.
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    // Clear all refresh timers
    for (const timer of this.refreshTimers.values()) {
      clearTimeout(timer);
    }
    this.refreshTimers.clear();

    // Stop watcher
    await this.watcher.dispose();

    // Dispose emitters
    this._onDirectoryListingChanged.dispose();
    this._onFileContentChanged.dispose();
    this._onFileRenamed.dispose();
    this._onFileDeleted.dispose();
  }

  // -------------------------------------------------------------------------
  // Internal: Watcher Event Handling
  // -------------------------------------------------------------------------

  /**
   * Wire up watcher events to provider events.
   */
  private setupWatcherEvents(): void {
    // File/directory created
    this.watcher.onCreated((event) => {
      const parentDir = path.dirname(event.path);
      this.scheduleRefresh(parentDir);
    });

    // File modified
    this.watcher.onModified((event) => {
      this._onFileContentChanged.fire({ path: event.path });
    });

    // File/directory deleted
    this.watcher.onDeleted((event) => {
      const parentDir = path.dirname(event.path);
      this.scheduleRefresh(parentDir);
      this._onFileDeleted.fire(event);

      // Also invalidate the deleted directory's cache if it was a directory
      DirectoryCache.delete(event.path);
    });

    // File/directory renamed
    this.watcher.onRenamed((event) => {
      // Refresh both old and new parent directories
      const oldParentDir = path.dirname(event.oldPath);
      const newParentDir = path.dirname(event.newPath);

      this.scheduleRefresh(oldParentDir);
      if (oldParentDir !== newParentDir) {
        this.scheduleRefresh(newParentDir);
      }

      this._onFileRenamed.fire(event);

      // Update cache for renamed directory
      if (event.isDirectory) {
        DirectoryCache.delete(event.oldPath);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Internal: Directory Reading
  // -------------------------------------------------------------------------

  /**
   * Read directory contents from disk.
   */
  private async readDirectoryFromDisk(
    dirPath: string,
  ): Promise<DirectoryEntry[]> {
    const dirents = await fs.readdir(dirPath, { withFileTypes: true });

    const entries: DirectoryEntry[] = dirents.map((dirent) => ({
      name: dirent.name,
      type: dirent.isDirectory() ? "directory" : "file",
    }));

    // Sort: directories first, then files, alphabetically
    return this.sortEntries(entries);
  }

  /**
   * Sort directory entries: directories first, then files, alphabetically.
   */
  private sortEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
    return entries.sort((a, b) => {
      // Directories before files
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      // Alphabetical within same type (case-insensitive)
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }

  // -------------------------------------------------------------------------
  // Internal: Refresh Scheduling
  // -------------------------------------------------------------------------

  /**
   * Schedule a directory refresh with debouncing.
   *
   * Multiple changes to the same directory within REFRESH_DEBOUNCE_MS
   * are coalesced into a single refresh.
   */
  private scheduleRefresh(dirPath: string): void {
    if (this.disposed) {
      return;
    }

    // Clear existing timer for this directory
    const existingTimer = this.refreshTimers.get(dirPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new refresh
    const timer = setTimeout(() => {
      this.refreshTimers.delete(dirPath);
      this.refreshDirectory(dirPath);
    }, REFRESH_DEBOUNCE_MS);

    this.refreshTimers.set(dirPath, timer);
  }

  /**
   * Actually refresh a directory and emit event if changed.
   */
  private async refreshDirectory(dirPath: string): Promise<void> {
    if (this.disposed) {
      return;
    }

    try {
      // Check if directory still exists
      const exists = await this.exists(dirPath);
      if (!exists) {
        DirectoryCache.delete(dirPath);
        return;
      }

      // Read fresh entries
      const entries = await this.readDirectoryFromDisk(dirPath);

      // Update cache
      DirectoryCache.set(dirPath, entries);

      // Emit event
      this._onDirectoryListingChanged.fire({
        path: dirPath,
        entries,
      });
    } catch (error) {
      console.error(
        `[DiskFileSystemProvider] Failed to refresh directory ${dirPath}:`,
        error,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Internal: Cache Verification
  // -------------------------------------------------------------------------

  /**
   * Schedule cache verification with cooldown.
   *
   * This ensures we don't hammer the disk when rapidly reading
   * the same directory.
   */
  private scheduleVerifyCache(dirPath: string): void {
    const now = Date.now();
    const lastVerify = this.lastVerifyTime.get(dirPath) ?? 0;

    // Skip if within cooldown
    if (now - lastVerify < VERIFY_CACHE_COOLDOWN_MS) {
      return;
    }

    this.lastVerifyTime.set(dirPath, now);

    // Verify in background (don't await)
    this.verifyCache(dirPath).catch((error) => {
      console.error(
        `[DiskFileSystemProvider] Cache verification failed for ${dirPath}:`,
        error,
      );
    });
  }

  /**
   * Verify cache matches disk and update if stale.
   */
  private async verifyCache(dirPath: string): Promise<void> {
    if (this.disposed) {
      return;
    }

    try {
      const cached = DirectoryCache.get(dirPath);
      if (!cached) {
        return;
      }

      // Read from disk
      const freshEntries = await this.readDirectoryFromDisk(dirPath);

      // Compare with cached (simple length + names check)
      const hasChanged =
        cached.entries.length !== freshEntries.length ||
        cached.entries.some(
          (entry, i) =>
            entry.name !== freshEntries[i].name ||
            entry.type !== freshEntries[i].type,
        );

      if (hasChanged) {
        DirectoryCache.set(dirPath, freshEntries);
        this._onDirectoryListingChanged.fire({
          path: dirPath,
          entries: freshEntries,
        });
      }
    } catch {
      // Directory might have been deleted
      DirectoryCache.delete(dirPath);
    }
  }

  // -------------------------------------------------------------------------
  // Internal: Prefetching
  // -------------------------------------------------------------------------

  /**
   * Prefetch child directories in the background.
   *
   * This makes expanding folders in the UI instant because
   * the data is already cached.
   */
  private prefetchChildren(
    parentPath: string,
    entries: DirectoryEntry[],
  ): void {
    if (this.disposed) {
      return;
    }

    // Get directories that aren't already cached
    const directories = entries
      .filter((e) => e.type === "directory")
      .map((e) => path.join(parentPath, e.name))
      .filter((p) => !DirectoryCache.has(p));

    // Limit concurrent prefetches
    const available = MAX_CONCURRENT_PREFETCH - this.activePrefetches.size;
    const toPrefetch = directories.slice(0, available);

    for (const dirPath of toPrefetch) {
      this.prefetchDirectory(dirPath);
    }
  }

  /**
   * Prefetch a single directory.
   */
  private async prefetchDirectory(dirPath: string): Promise<void> {
    if (this.disposed || this.activePrefetches.has(dirPath)) {
      return;
    }

    this.activePrefetches.add(dirPath);

    try {
      const entries = await this.readDirectoryFromDisk(dirPath);
      DirectoryCache.set(dirPath, entries);
    } catch {
      // Ignore errors during prefetch (directory might not exist or be unreadable)
    } finally {
      this.activePrefetches.delete(dirPath);
    }
  }

  // -------------------------------------------------------------------------
  // Internal: Helpers
  // -------------------------------------------------------------------------

  /**
   * Check if a file is readonly based on its stats.
   */
  private isReadonly(stats: fsSync.Stats): boolean {
    // Check if user has write permission
    // eslint-disable-next-line no-bitwise
    return (stats.mode & 0o200) === 0;
  }
}
