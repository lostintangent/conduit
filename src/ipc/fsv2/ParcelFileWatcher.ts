/**
 * ParcelFileWatcher - File system change detection using @parcel/watcher.
 *
 * This module provides real-time file system monitoring with:
 * - Native OS-level watching (FSEvents on macOS, inotify on Linux, etc.)
 * - Intelligent rename detection (correlates DELETE+CREATE events)
 * - Debounced event emission to prevent event storms
 * - Configurable ignore patterns for performance
 *
 * Design Decisions:
 *
 * 1. **EventEmitter pattern**: Uses our typed EventEmitter from Phase 1
 *    for type-safe event subscriptions with disposable cleanup.
 *
 * 2. **Rename detection**: File systems emit DELETE+CREATE for renames.
 *    We correlate these events within a 500ms window to emit semantic
 *    RENAME events instead.
 *
 * 3. **Debouncing**: Rapid file changes (like auto-save) are coalesced
 *    to prevent flooding the UI with updates.
 *
 * 4. **Symlink resolution**: Resolves symlinks to handle macOS edge cases
 *    like /var → /private/var.
 */

import watcher, { AsyncSubscription } from "@parcel/watcher";
import fs from "node:fs";
import path from "node:path";

import { EventEmitter } from "../../shared/EventEmitter";
import type {
  Event,
  FileContentChangedEvent,
  FileDeletedEvent,
  FileRenamedEvent,
} from "./types";

// ============================================================================
// Types
// ============================================================================

/**
 * Event emitted when a file or directory is created.
 */
export interface FileCreatedEvent {
  /** Absolute path to the created file/directory */
  path: string;
  /** Whether this is a directory */
  isDirectory: boolean;
}

/**
 * Options for configuring the file watcher.
 */
export interface ParcelFileWatcherOptions {
  /**
   * Glob patterns to ignore.
   * Defaults to common non-essential directories if not specified.
   */
  ignored?: string[];
}

/**
 * Default patterns to ignore for performance.
 * These are directories/files that rarely need watching in a code editor.
 */
const DEFAULT_IGNORED_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.cache/**",
  "**/coverage/**",
  "**/*.log",
  "**/.DS_Store",
];

// ============================================================================
// Rename Detector
// ============================================================================

/**
 * Tracks pending file events to detect renames.
 *
 * File systems don't emit atomic "rename" events. Instead they emit:
 * - DELETE(oldPath) + CREATE(newPath) (most common)
 * - CREATE(newPath) + DELETE(oldPath) (less common, but happens)
 *
 * This class correlates these events within a time window to detect renames.
 */
class RenameDetector {
  /** Pending DELETE events: path → timestamp */
  private pendingDeletes = new Map<string, number>();

  /** Pending CREATE events: path → timestamp */
  private pendingCreates = new Map<string, number>();

  /** Active timers for cleanup to prevent memory leaks */
  private deleteTimers = new Map<string, NodeJS.Timeout>();
  private createTimers = new Map<string, NodeJS.Timeout>();

  /** Time window for correlating events (ms) */
  private readonly correlationWindow = 500;

  /**
   * Record a DELETE event for potential rename detection.
   */
  recordDelete(filePath: string): void {
    this.pendingDeletes.set(filePath, Date.now());

    // Clear any existing timer for this path
    const existingTimer = this.deleteTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Auto-cleanup after correlation window
    const timer = setTimeout(() => {
      this.pendingDeletes.delete(filePath);
      this.deleteTimers.delete(filePath);
    }, this.correlationWindow);

    this.deleteTimers.set(filePath, timer);
  }

  /**
   * Record a CREATE event for potential rename detection.
   */
  recordCreate(filePath: string): void {
    this.pendingCreates.set(filePath, Date.now());

    // Clear any existing timer for this path
    const existingTimer = this.createTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Auto-cleanup after correlation window
    const timer = setTimeout(() => {
      this.pendingCreates.delete(filePath);
      this.createTimers.delete(filePath);
    }, this.correlationWindow);

    this.createTimers.set(filePath, timer);
  }

  /**
   * Check if a CREATE event is actually a rename (DELETE came first).
   *
   * @param newPath - The path of the created file
   * @returns The old path if this is a rename, null otherwise
   */
  matchCreateWithDelete(newPath: string): string | null {
    const newDir = path.dirname(newPath);
    const now = Date.now();

    for (const [oldPath, timestamp] of this.pendingDeletes.entries()) {
      // Must be within correlation window
      if (now - timestamp > this.correlationWindow) {
        continue;
      }

      // Must be in same directory (rename, not move)
      if (path.dirname(oldPath) !== newDir) {
        continue;
      }

      // Must be different paths
      if (oldPath === newPath) {
        continue;
      }

      // Found a match - consume the pending delete
      this.pendingDeletes.delete(oldPath);
      return oldPath;
    }

    return null;
  }

  /**
   * Check if a DELETE event is actually a rename (CREATE came first).
   *
   * @param oldPath - The path of the deleted file
   * @returns The new path if this is a rename, null otherwise
   */
  matchDeleteWithCreate(oldPath: string): string | null {
    const oldDir = path.dirname(oldPath);
    const now = Date.now();

    for (const [newPath, timestamp] of this.pendingCreates.entries()) {
      // Must be within correlation window
      if (now - timestamp > this.correlationWindow) {
        continue;
      }

      // Must be in same directory (rename, not move)
      if (path.dirname(newPath) !== oldDir) {
        continue;
      }

      // Must be different paths
      if (oldPath === newPath) {
        continue;
      }

      // Found a match - consume the pending create
      this.pendingCreates.delete(newPath);
      return newPath;
    }

    return null;
  }

  /**
   * Clear all pending events and timers.
   */
  clear(): void {
    // Clear all pending timers to prevent memory leaks
    for (const timer of this.deleteTimers.values()) {
      clearTimeout(timer);
    }
    for (const timer of this.createTimers.values()) {
      clearTimeout(timer);
    }

    this.pendingDeletes.clear();
    this.pendingCreates.clear();
    this.deleteTimers.clear();
    this.createTimers.clear();
  }
}

// ============================================================================
// ParcelFileWatcher
// ============================================================================

/**
 * File watcher implementation using @parcel/watcher.
 *
 * Provides type-safe events for file system changes with intelligent
 * rename detection and debouncing.
 *
 * @example
 * ```typescript
 * const watcher = new ParcelFileWatcher('/project/src');
 *
 * watcher.onCreated((event) => {
 *   console.log('File created:', event.path);
 * });
 *
 * watcher.onModified((event) => {
 *   console.log('File modified:', event.path);
 * });
 *
 * watcher.onRenamed((event) => {
 *   console.log('Renamed:', event.oldPath, '→', event.newPath);
 * });
 *
 * await watcher.watch();
 *
 * // Later...
 * await watcher.dispose();
 * ```
 */
export class ParcelFileWatcher {
  /** The directory being watched */
  readonly path: string;

  /** Resolved real path (handles symlinks) */
  private readonly realPath: string;

  /** Ignore patterns */
  private readonly ignored: string[];

  /** The @parcel/watcher subscription */
  private subscription: AsyncSubscription | null = null;

  /** Whether currently watching */
  private watching = false;

  /** Rename detection helper */
  private renameDetector = new RenameDetector();

  /** Debounce timers */
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  // -------------------------------------------------------------------------
  // Event Emitters
  // -------------------------------------------------------------------------

  private readonly _onCreated = new EventEmitter<FileCreatedEvent>();
  private readonly _onModified = new EventEmitter<FileContentChangedEvent>();
  private readonly _onDeleted = new EventEmitter<FileDeletedEvent>();
  private readonly _onRenamed = new EventEmitter<FileRenamedEvent>();

  /** Fired when a file or directory is created */
  readonly onCreated: Event<FileCreatedEvent> = this._onCreated.event;

  /** Fired when a file's content is modified */
  readonly onModified: Event<FileContentChangedEvent> = this._onModified.event;

  /** Fired when a file or directory is deleted */
  readonly onDeleted: Event<FileDeletedEvent> = this._onDeleted.event;

  /** Fired when a file or directory is renamed */
  readonly onRenamed: Event<FileRenamedEvent> = this._onRenamed.event;

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  /**
   * Create a new file watcher.
   *
   * @param watchPath - Directory to watch
   * @param options - Watcher configuration
   */
  constructor(watchPath: string, options: ParcelFileWatcherOptions = {}) {
    this.path = watchPath;
    this.ignored = options.ignored ?? DEFAULT_IGNORED_PATTERNS;

    // Resolve symlinks for consistent path matching
    // Handles macOS /var → /private/var edge case
    try {
      this.realPath = fs.realpathSync(watchPath);
    } catch {
      this.realPath = path.resolve(watchPath);
    }
  }

  // -------------------------------------------------------------------------
  // Public Methods
  // -------------------------------------------------------------------------

  /**
   * Start watching for file changes.
   *
   * @throws If watching fails to start
   */
  async watch(): Promise<void> {
    if (this.watching) {
      return;
    }

    const backend = this.getBackend();

    this.subscription = await watcher.subscribe(
      this.path,
      (err, events) => {
        if (err) {
          console.error("[ParcelFileWatcher] Error:", err);
          return;
        }
        this.handleEvents(events);
      },
      {
        backend,
        ignore: this.ignored,
      },
    );

    this.watching = true;
  }

  /**
   * Stop watching for file changes.
   */
  async unwatch(): Promise<void> {
    if (!this.watching || !this.subscription) {
      return;
    }

    await this.subscription.unsubscribe();
    this.subscription = null;
    this.watching = false;

    this.clearDebounceTimers();
    this.renameDetector.clear();
  }

  /**
   * Check if currently watching.
   */
  isWatching(): boolean {
    return this.watching;
  }

  /**
   * Clean up all resources.
   *
   * Stops watching and disposes all event emitters.
   */
  async dispose(): Promise<void> {
    await this.unwatch();

    this._onCreated.dispose();
    this._onModified.dispose();
    this._onDeleted.dispose();
    this._onRenamed.dispose();
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  /**
   * Get the appropriate watcher backend for the current platform.
   */
  private getBackend(): "fs-events" | "inotify" | "windows" {
    switch (process.platform) {
      case "darwin":
        return "fs-events";
      case "linux":
        return "inotify";
      default:
        return "windows";
    }
  }

  /**
   * Handle a batch of events from @parcel/watcher.
   */
  private handleEvents(
    events: Array<{ type: "create" | "update" | "delete"; path: string }>,
  ): void {
    for (const event of events) {
      // Double-check ignore patterns (parcel's ignore is best-effort)
      if (this.shouldIgnore(event.path)) {
        continue;
      }

      switch (event.type) {
        case "create":
          this.handleCreate(event.path);
          break;
        case "update":
          this.handleUpdate(event.path);
          break;
        case "delete":
          this.handleDelete(event.path);
          break;
      }
    }
  }

  /**
   * Check if a path matches any ignore pattern.
   *
   * Uses simple pattern matching for common glob patterns.
   */
  private shouldIgnore(filePath: string): boolean {
    // Normalize path separators for consistent matching
    const normalizedPath = filePath.replace(/\\/g, "/");

    for (const pattern of this.ignored) {
      if (this.matchPattern(normalizedPath, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Match a path against a glob-like pattern.
   *
   * Supports common patterns:
   * - Double-star/name/double-star: contains /name/ anywhere
   * - Double-star/*.ext: ends with .ext
   * - Double-star/name: ends with /name or equals name
   */
  private matchPattern(filePath: string, pattern: string): boolean {
    // Handle `**/dir/**` pattern (match path containing /dir/)
    const dirMatch = pattern.match(/^\*\*\/(.+)\/\*\*$/);
    if (dirMatch) {
      const dirName = dirMatch[1];
      return (
        filePath.includes(`/${dirName}/`) ||
        filePath.startsWith(`${dirName}/`) ||
        filePath.endsWith(`/${dirName}`)
      );
    }

    // Handle `**/*.ext` pattern (match files with extension)
    const extMatch = pattern.match(/^\*\*\/\*(\.[^/]+)$/);
    if (extMatch) {
      return filePath.endsWith(extMatch[1]);
    }

    // Handle `**/name` pattern (match files/dirs named exactly)
    const nameMatch = pattern.match(/^\*\*\/(.+)$/);
    if (nameMatch) {
      const name = nameMatch[1];
      return filePath.endsWith(`/${name}`) || filePath === name;
    }

    // Fallback: check if pattern (as literal) is in path
    return filePath.includes(pattern);
  }

  /**
   * Handle a CREATE event.
   */
  private handleCreate(filePath: string): void {
    // Check if this CREATE matches a pending DELETE (rename detection)
    const oldPath = this.renameDetector.matchCreateWithDelete(filePath);

    if (oldPath) {
      // It's a rename! Cancel pending delete event and emit rename
      this.cancelDebounce(`delete:${oldPath}`);
      this.emitRename(oldPath, filePath);
    } else {
      // Record this CREATE in case DELETE comes later
      this.renameDetector.recordCreate(filePath);

      // Debounce CREATE event with longer delay to allow rename detection
      // (DELETE might come after CREATE in some cases)
      this.debounce(`create:${filePath}`, 200, () => {
        // Re-check for rename match before emitting create
        // (in case DELETE arrived during debounce window)
        const matchedOldPath =
          this.renameDetector.matchCreateWithDelete(filePath);
        if (matchedOldPath) {
          this.cancelDebounce(`delete:${matchedOldPath}`);
          this.emitRename(matchedOldPath, filePath);
        } else {
          const isDirectory = this.isDirectory(filePath);
          this._onCreated.fire({ path: filePath, isDirectory });
        }
      });
    }
  }

  /**
   * Handle an UPDATE event.
   */
  private handleUpdate(filePath: string): void {
    // Debounce rapid updates (like auto-save)
    this.debounce(`update:${filePath}`, 50, () => {
      this._onModified.fire({ path: filePath });
    });
  }

  /**
   * Handle a DELETE event.
   */
  private handleDelete(filePath: string): void {
    // Check if this DELETE matches a pending CREATE (reverse rename detection)
    const newPath = this.renameDetector.matchDeleteWithCreate(filePath);

    if (newPath) {
      // It's a rename! Cancel pending create event and emit rename
      this.cancelDebounce(`create:${newPath}`);
      this.emitRename(filePath, newPath);
    } else {
      // Record this DELETE in case CREATE comes later
      this.renameDetector.recordDelete(filePath);

      // Debounce DELETE event (longer delay to allow rename detection)
      this.debounce(`delete:${filePath}`, 200, () => {
        // Re-check for rename match before emitting delete
        // (in case CREATE arrived during debounce window)
        const matchedNewPath =
          this.renameDetector.matchDeleteWithCreate(filePath);
        if (matchedNewPath) {
          this.cancelDebounce(`create:${matchedNewPath}`);
          this.emitRename(filePath, matchedNewPath);
        } else {
          this._onDeleted.fire({
            path: filePath,
            isDirectory: false, // Can't determine for deleted files
          });
        }
      });
    }
  }

  /**
   * Emit a rename event.
   */
  private emitRename(oldPath: string, newPath: string): void {
    const isDirectory = this.isDirectory(newPath);
    this._onRenamed.fire({ oldPath, newPath, isDirectory });
  }

  /**
   * Check if a path is a directory.
   */
  private isDirectory(filePath: string): boolean {
    try {
      return fs.statSync(filePath).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Debounce a callback with the given key and delay.
   */
  private debounce(key: string, delay: number, callback: () => void): void {
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      callback();
    }, delay);

    this.debounceTimers.set(key, timer);
  }

  /**
   * Cancel a pending debounced callback.
   */
  private cancelDebounce(key: string): void {
    const timer = this.debounceTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(key);
    }
  }

  /**
   * Clear all debounce timers.
   */
  private clearDebounceTimers(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
