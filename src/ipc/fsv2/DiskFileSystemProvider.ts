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
import * as nodePath from "node:path";
import { spawn } from "node:child_process";

import { EventEmitter } from "../../shared/EventEmitter";
import { DirectoryCache } from "./DirectoryCache";
import {
  ParcelFileWatcher,
  type ParcelFileWatcherOptions,
} from "./ParcelFileWatcher";
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

/** Names to always filter out from directory listings */
const ALWAYS_HIDDEN = new Set([".git", "node_modules"]);

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

  /** Cached git root path (null if not in a git repo, undefined if not yet checked) */
  private gitRoot: string | null | undefined = undefined;

  /** Cache of gitignored paths (relative to git root) */
  private gitIgnoreCache = new Map<string, boolean>();

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
    this.cwd = nodePath.resolve(cwd);

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
  async stat(path: string): Promise<FileStat> {
    const stats = await fs.stat(path);

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
    DirectoryCache.addEntry(parentDir, { name: fileName, type: "file" });
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
    // Get the type before rename (file or directory)
    const stats = await fs.stat(oldPath);
    const entryType = stats.isDirectory() ? "directory" : "file";

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

    // Add to new location
    DirectoryCache.addEntry(newParentDir, { name: newName, type: entryType });

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
    DirectoryCache.addEntry(parentDir, { name: dirName, type: "directory" });

    // Initialize the new directory as empty in cache
    DirectoryCache.set(dirPath, []);
  }

  /**
   * Check if a path exists.
   */
  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
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
      const parentDir = nodePath.dirname(event.path);
      this.scheduleRefresh(parentDir);
    });

    // File modified
    this.watcher.onModified((event) => {
      this._onFileContentChanged.fire({ path: event.path });
    });

    // File/directory deleted
    this.watcher.onDeleted((event) => {
      const parentDir = nodePath.dirname(event.path);
      this.scheduleRefresh(parentDir);
      this._onFileDeleted.fire(event);

      // Also invalidate the deleted directory's cache if it was a directory
      DirectoryCache.delete(event.path);
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
    });
  }

  // -------------------------------------------------------------------------
  // Internal: Directory Reading
  // -------------------------------------------------------------------------

  /**
   * Read directory contents from disk.
   *
   * Filters out:
   * - Always-hidden entries (.git, node_modules)
   * - Gitignored files (via .gitignore)
   */
  private async readDirectoryFromDisk(
    dirPath: string,
  ): Promise<DirectoryEntry[]> {
    const dirents = await fs.readdir(dirPath, { withFileTypes: true });

    // Initial entries (before filtering)
    let entries: DirectoryEntry[] = dirents
      .filter((dirent) => !ALWAYS_HIDDEN.has(dirent.name))
      .map((dirent) => ({
        name: dirent.name,
        type: dirent.isDirectory() ? "directory" : "file",
      }));

    // Filter gitignored entries
    const gitIgnored = await this.getGitIgnoredEntries(dirPath, entries);
    if (gitIgnored.size > 0) {
      entries = entries.filter((e) => !gitIgnored.has(e.name));
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

  // -------------------------------------------------------------------------
  // Internal: Git Ignore Filtering
  // -------------------------------------------------------------------------

  /**
   * Find the git root for this provider's cwd.
   *
   * Result is cached after first call.
   */
  private async findGitRoot(): Promise<string | null> {
    if (this.gitRoot !== undefined) {
      return this.gitRoot;
    }

    return new Promise((resolve) => {
      const child = spawn("git", ["rev-parse", "--show-toplevel"], {
        cwd: this.cwd,
        stdio: ["ignore", "pipe", "ignore"],
      });

      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
      });

      child.once("error", () => {
        this.gitRoot = null;
        resolve(null);
      });

      child.once("close", (code) => {
        if (code === 0 && output.trim()) {
          this.gitRoot = output.trim();
          resolve(this.gitRoot);
        } else {
          this.gitRoot = null;
          resolve(null);
        }
      });
    });
  }

  /**
   * Check if files are gitignored using batch `git check-ignore`.
   *
   * @param dirPath - Directory containing the files
   * @param entries - Entries to check
   * @returns Set of gitignored entry names
   */
  private async getGitIgnoredEntries(
    dirPath: string,
    entries: DirectoryEntry[],
  ): Promise<Set<string>> {
    const gitRoot = await this.findGitRoot();
    if (!gitRoot) {
      return new Set();
    }

    const ignored = new Set<string>();

    // Build list of paths to check (relative to git root)
    const pathsToCheck: Array<{ name: string; relativePath: string }> = [];

    for (const entry of entries) {
      const fullPath = nodePath.join(dirPath, entry.name);
      const relativePath = nodePath.relative(gitRoot, fullPath);

      // Skip if outside git repo
      if (relativePath.startsWith("..")) {
        continue;
      }

      // Check cache first
      const cached = this.gitIgnoreCache.get(relativePath);
      if (cached !== undefined) {
        if (cached) {
          ignored.add(entry.name);
        }
        continue;
      }

      pathsToCheck.push({ name: entry.name, relativePath });
    }

    // If all entries were cached, return early
    if (pathsToCheck.length === 0) {
      return ignored;
    }

    // Batch check with git check-ignore
    return new Promise((resolve) => {
      const child = spawn("git", ["check-ignore", "--stdin"], {
        cwd: gitRoot,
        stdio: ["pipe", "pipe", "ignore"],
      });

      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
      });

      child.once("error", () => {
        // On error, assume nothing is ignored
        resolve(ignored);
      });

      child.once("close", () => {
        // Parse output - each line is a path that IS ignored
        const ignoredPaths = new Set(
          output
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        );

        // Update cache and results
        for (const { name, relativePath } of pathsToCheck) {
          // Normalize to forward slashes for comparison
          const normalizedRelative = relativePath.split(nodePath.sep).join("/");
          const isIgnored = ignoredPaths.has(normalizedRelative);
          this.gitIgnoreCache.set(relativePath, isIgnored);
          if (isIgnored) {
            ignored.add(name);
          }
        }

        resolve(ignored);
      });

      // Write paths to stdin (one per line, forward slashes)
      const input = pathsToCheck
        .map(({ relativePath }) => relativePath.split(nodePath.sep).join("/"))
        .join("\n");
      child.stdin.write(input);
      child.stdin.end();
    });
  }
}
