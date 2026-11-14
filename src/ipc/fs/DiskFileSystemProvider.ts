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
 */

import * as fs from "node:fs/promises";
import * as nodePath from "node:path";

import { EventEmitter } from "../../shared/EventEmitter";
import { DirectoryCache } from "./DirectoryCache";
import { GitIgnoreCache } from "./GitIgnoreCache";
import { ParcelFileWatcher } from "./ParcelFileWatcher";
import {
  ALWAYS_HIDDEN,
  type DeleteOptions,
  type DirectoryEntry,
  type DirectoryListingChangedEvent,
  type Event,
  type FileContentChangedEvent,
  type FileDeletedEvent,
  type FileRenamedEvent,
  type FileStat,
  type FileSystemProvider,
} from "./types";

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
// Stateless reads
// ============================================================================

/**
 * Reads that touch no provider state (cache, watcher or cwd), so callers that
 * have no provider can use them without creating one and starting its watcher.
 */
export const diskReads = {
  async stat(path: string): Promise<FileStat> {
    const stats = await fs.stat(path);
    return {
      type: stats.isDirectory() ? "directory" : "file",
      size: stats.size,
      mtime: stats.mtimeMs,
      ctime: stats.ctimeMs,
      // eslint-disable-next-line no-bitwise
      readonly: (stats.mode & 0o200) === 0,
    };
  },

  async readFile(filePath: string): Promise<Uint8Array> {
    return new Uint8Array(await fs.readFile(filePath));
  },

  /** Binary files will have invalid UTF-8 bytes replaced with U+FFFD. */
  async readTextFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, "utf-8");
  },

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  },
};

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

  /** Cached git root for this cwd (null if not in repo, undefined if not yet checked) */
  private gitRoot: string | null | undefined = undefined;

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
   */
  constructor(cwd: string) {
    this.cwd = nodePath.resolve(cwd);

    // Initialize watcher and wire up events
    this.watcher = new ParcelFileWatcher(this.cwd);
    this.setupWatcherEvents();

    // Eagerly initialize git root so watcher filtering works immediately
    this.initializeGitRoot();
  }

  /**
   * Initialize git root asynchronously.
   * Called from constructor to ensure gitRoot is available for watcher filtering.
   */
  private initializeGitRoot(): void {
    GitIgnoreCache.getGitRoot(this.cwd).then((root) => {
      this.gitRoot = root;
    });
  }

  // -------------------------------------------------------------------------
  // File Operations
  // -------------------------------------------------------------------------

  /**
   * Get metadata for a file or directory.
   */
  stat(path: string): Promise<FileStat> {
    return diskReads.stat(path);
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
    const normalizedPath = nodePath.resolve(dirPath);

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
   * Read complete file contents as binary.
   */
  readFile(filePath: string): Promise<Uint8Array> {
    return diskReads.readFile(filePath);
  }

  /**
   * Read complete file contents as text (UTF-8).
   *
   * Convenience method that returns a string directly, avoiding the need
   * for TextDecoder on the caller side.
   */
  readTextFile(filePath: string): Promise<string> {
    return diskReads.readTextFile(filePath);
  }

  /**
   * Write content to a file.
   *
   * Creates parent directories if they don't exist.
   * Updates the directory cache in-place for immediate consistency.
   */
  async writeFile(filePath: string, content: Uint8Array): Promise<void> {
    // Ensure parent directory exists
    const parentDir = nodePath.dirname(filePath);
    await fs.mkdir(parentDir, { recursive: true });

    // Write the file
    await fs.writeFile(filePath, content);

    // Update cache in-place: add/update the file entry in parent directory
    const fileName = nodePath.basename(filePath);
    DirectoryCache.addEntry(
      parentDir,
      this.buildCacheEntry(fileName, "file", filePath),
    );
  }

  /**
   * Delete a file or directory.
   *
   * Updates the directory cache in-place for immediate consistency.
   */
  async delete(path: string, options?: DeleteOptions): Promise<void> {
    // Check if it's a directory before deleting (for cache cleanup)
    let isDirectory = false;
    try {
      const stats = await fs.stat(path);
      isDirectory = stats.isDirectory();
    } catch {
      // Path might not exist, proceed with delete anyway
    }

    await fs.rm(path, {
      recursive: options?.recursive ?? false,
      force: false,
    });

    // Update cache in-place: remove the entry from parent directory
    const parentDir = nodePath.dirname(path);
    const fileName = nodePath.basename(path);
    DirectoryCache.removeEntry(parentDir, fileName);

    // If this was a directory, also remove its cache entry
    if (isDirectory) {
      DirectoryCache.delete(path);
    }
  }

  /**
   * Rename or move a file/directory.
   *
   * Updates the directory cache in-place for immediate consistency.
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    // Get the type and symlink status before rename (use lstat to not follow symlinks)
    const stats = await fs.lstat(oldPath);
    const entryType = stats.isDirectory() ? "directory" : "file";
    const isSymlink = stats.isSymbolicLink();

    // Ensure parent directory of new path exists
    const newParentDir = nodePath.dirname(newPath);
    await fs.mkdir(newParentDir, { recursive: true });

    await fs.rename(oldPath, newPath);

    // Update cache in-place
    const oldParentDir = nodePath.dirname(oldPath);
    const oldName = nodePath.basename(oldPath);
    const newName = nodePath.basename(newPath);

    // Remove from old location
    DirectoryCache.removeEntry(oldParentDir, oldName);

    // Add to new location (preserve symlink status, recalculate gitignore for new path)
    DirectoryCache.addEntry(
      newParentDir,
      this.buildCacheEntry(newName, entryType, newPath, isSymlink),
    );

    // If it was a directory, update its cache key
    if (entryType === "directory") {
      const oldCache = DirectoryCache.get(oldPath);
      if (oldCache) {
        DirectoryCache.set(newPath, oldCache.entries);
        DirectoryCache.delete(oldPath);
      }
    }
  }

  /**
   * Create a directory.
   *
   * Creates parent directories if they don't exist (like `mkdir -p`).
   * Updates the directory cache in-place for immediate consistency.
   */
  async createDirectory(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });

    // Update cache in-place: add the directory entry to parent
    const parentDir = nodePath.dirname(dirPath);
    const dirName = nodePath.basename(dirPath);
    DirectoryCache.addEntry(
      parentDir,
      this.buildCacheEntry(dirName, "directory", dirPath),
    );

    // Initialize the new directory as empty in cache
    DirectoryCache.set(dirPath, []);
  }

  /**
   * Check if a path exists.
   */
  exists(path: string): Promise<boolean> {
    return diskReads.exists(path);
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
   * Build a DirectoryEntry for cache updates.
   *
   * Uses cached git root (if available) to set isGitignored synchronously.
   * If git root isn't cached yet, isGitignored is omitted and will be set
   * correctly when the watcher triggers a full directory refresh.
   */
  private buildCacheEntry(
    name: string,
    type: "file" | "directory",
    fullPath: string,
    isSymlink = false,
  ): DirectoryEntry {
    const entry: DirectoryEntry = { name, type, isSymlink };

    // Set isGitignored if we have the git root cached
    if (this.gitRoot) {
      entry.isGitignored = GitIgnoreCache.isIgnored(this.gitRoot, fullPath);
    }

    return entry;
  }

  /**
   * Refresh isGitignored status for all cached directories under the git root.
   *
   * Called when .gitignore changes. This is efficient because:
   * 1. Only processes directories already in cache (no disk I/O)
   * 2. Only fires events for directories where status actually changed
   * 3. Recalculates in-place without re-reading directory contents
   */
  private async refreshGitignoreAffectedDirectories(): Promise<void> {
    // Need git root to scope the refresh
    const gitRoot = await this.getGitRoot();
    if (!gitRoot) {
      return;
    }

    // Get all cached directories under the git root
    const cachedPaths = DirectoryCache.getPathsUnder(gitRoot);
    if (cachedPaths.length === 0) {
      return;
    }

    // Process each cached directory
    for (const dirPath of cachedPaths) {
      const cached = DirectoryCache.get(dirPath);
      if (!cached || cached.entries.length === 0) {
        continue;
      }

      // Recalculate gitignore status for all entries
      const gitIgnored = await GitIgnoreCache.getIgnoredEntries(
        dirPath,
        cached.entries.map((e) => ({
          name: e.name,
          isDirectory: e.type === "directory",
        })),
        gitRoot,
      );

      // Check if anything actually changed and build updated entries
      let hasChanges = false;
      const updatedEntries = cached.entries.map((entry) => {
        const newIsGitignored = gitIgnored.has(entry.name);
        if (entry.isGitignored !== newIsGitignored) {
          hasChanges = true;
          return { ...entry, isGitignored: newIsGitignored };
        }
        return entry;
      });

      // Only update cache and fire event if something changed
      if (hasChanges) {
        DirectoryCache.set(dirPath, updatedEntries);
        this._onDirectoryListingChanged.fire({
          path: dirPath,
          entries: updatedEntries,
        });
      }
    }
  }

  /**
   * Wire up watcher events to provider events.
   */
  private setupWatcherEvents(): void {
    // File/directory created
    this.watcher.onCreated((event) => {
      // Handle .gitignore changes - invalidate cache and refresh all affected directories
      if (nodePath.basename(event.path) === ".gitignore") {
        GitIgnoreCache.invalidateForGitignore(event.path);
        // Fire-and-forget: refresh gitignore status for all cached directories
        this.refreshGitignoreAffectedDirectories();
      }

      const parentDir = nodePath.dirname(event.path);
      this.scheduleRefresh(parentDir);

      // Notify about new file content (so git status gets refreshed)
      if (!event.isDirectory) {
        this._onFileContentChanged.fire({ path: event.path });
      }
    });

    // File modified
    this.watcher.onModified((event) => {
      // Handle .gitignore changes - invalidate cache and refresh all affected directories
      if (nodePath.basename(event.path) === ".gitignore") {
        GitIgnoreCache.invalidateForGitignore(event.path);
        // Fire-and-forget: refresh gitignore status for all cached directories
        this.refreshGitignoreAffectedDirectories();
      }

      this._onFileContentChanged.fire({ path: event.path });
    });

    // File/directory deleted
    this.watcher.onDeleted((event) => {
      // Handle .gitignore changes - invalidate cache and refresh all affected directories
      if (nodePath.basename(event.path) === ".gitignore") {
        GitIgnoreCache.invalidateForGitignore(event.path);
        // Fire-and-forget: refresh gitignore status for all cached directories
        this.refreshGitignoreAffectedDirectories();
      }

      const parentDir = nodePath.dirname(event.path);
      this.scheduleRefresh(parentDir);
      this._onFileDeleted.fire(event);

      // Also invalidate the deleted directory's cache if it was a directory
      DirectoryCache.delete(event.path);

      // Notify about deleted file/folder (so git status gets refreshed)
      // For directories, this triggers refresh for all files inside
      this._onFileContentChanged.fire({ path: event.path });
    });

    // File/directory renamed
    this.watcher.onRenamed((event) => {
      // Refresh both old and new parent directories
      const oldParentDir = nodePath.dirname(event.oldPath);
      const newParentDir = nodePath.dirname(event.newPath);

      this.scheduleRefresh(oldParentDir);
      if (oldParentDir !== newParentDir) {
        this.scheduleRefresh(newParentDir);
      }

      this._onFileRenamed.fire(event);

      // Update cache for renamed directory
      if (event.isDirectory) {
        DirectoryCache.delete(event.oldPath);
      }

      // Notify about renamed file/folder (so git status gets refreshed)
      // For directories, this triggers refresh for all files inside
      this._onFileContentChanged.fire({ path: event.newPath });
    });
  }

  // -------------------------------------------------------------------------
  // Internal: Directory Reading
  // -------------------------------------------------------------------------

  /**
   * Get the git root for this provider's cwd (lazy initialization).
   * Cached after first lookup - only one git process spawn per provider lifetime.
   */
  private async getGitRoot(): Promise<string | null> {
    if (this.gitRoot === undefined) {
      this.gitRoot = await GitIgnoreCache.getGitRoot(this.cwd);
    }
    return this.gitRoot;
  }

  /**
   * Read directory contents from disk.
   *
   * Filters out:
   * - Always-hidden entries (.git, node_modules)
   *
   * Marks with isGitignored:
   * - Gitignored files (via .gitignore)
   */
  private async readDirectoryFromDisk(
    dirPath: string,
  ): Promise<DirectoryEntry[]> {
    const dirents = await fs.readdir(dirPath, { withFileTypes: true });

    // Initial entries (before gitignore marking)
    let entries: DirectoryEntry[] = dirents
      .filter((dirent) => !ALWAYS_HIDDEN.has(dirent.name))
      .map((dirent) => ({
        name: dirent.name,
        type: dirent.isDirectory() ? "directory" : "file",
        isSymlink: dirent.isSymbolicLink(),
      }));

    // Mark gitignored entries (using shared cache with pre-resolved git root)
    const gitRoot = await this.getGitRoot();
    const gitIgnored = await GitIgnoreCache.getIgnoredEntries(
      dirPath,
      entries.map((e) => ({
        name: e.name,
        isDirectory: e.type === "directory",
      })),
      gitRoot,
    );
    if (gitIgnored.size > 0) {
      entries = entries.map((e) => ({
        ...e,
        isGitignored: gitIgnored.has(e.name),
      }));
    }

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

    // Normalize path to match readDirectory's cache key format
    const normalizedPath = nodePath.resolve(dirPath);

    try {
      // Check if directory still exists
      const exists = await this.exists(normalizedPath);
      if (!exists) {
        DirectoryCache.delete(normalizedPath);
        return;
      }

      // Read fresh entries
      const entries = await this.readDirectoryFromDisk(normalizedPath);

      // Update cache
      DirectoryCache.set(normalizedPath, entries);

      // Emit event
      this._onDirectoryListingChanged.fire({
        path: normalizedPath,
        entries,
      });
    } catch (error) {
      // Silently ignore permission errors (common when watching home directory
      // and system directories like ~/Library have restricted access)
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES") {
        return;
      }
      console.error(
        `[DiskFileSystemProvider] Failed to refresh directory ${normalizedPath}:`,
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
      // Silently ignore permission errors
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES") {
        return;
      }
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
      .map((e) => nodePath.join(parentPath, e.name))
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
}
