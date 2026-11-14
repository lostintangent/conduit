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
import { normalizePathForComparison } from "./pathUtils";
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
   * Defaults to DEFAULT_IGNORED_PATTERNS (node_modules, .git, dist, etc.) if not specified.
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
  /** Pending DELETE events: normalized path → { originalPath, timestamp } */
  private pendingDeletes = new Map<
    string,
    { originalPath: string; timestamp: number }
  >();

  /** Pending CREATE events: normalized path → { originalPath, timestamp } */
  private pendingCreates = new Map<
    string,
    { originalPath: string; timestamp: number }
  >();

  /** Time window for correlating events (ms) */
  private readonly correlationWindow = 500;

  /**
   * Normalize a path for case-insensitive comparison on macOS/Windows.
   */
  private normalizePath(filePath: string): string {
    return normalizePathForComparison(filePath);
  }

  /**
   * Record a DELETE event for potential rename detection.
   */
  recordDelete(filePath: string): void {
    const normalized = this.normalizePath(filePath);
    this.pendingDeletes.set(normalized, {
      originalPath: filePath,
      timestamp: Date.now(),
    });

    // Auto-cleanup after correlation window
    setTimeout(() => {
      this.pendingDeletes.delete(normalized);
    }, this.correlationWindow);
  }

  /**
   * Record a CREATE event for potential rename detection.
   */
  recordCreate(filePath: string): void {
    const normalized = this.normalizePath(filePath);
    this.pendingCreates.set(normalized, {
      originalPath: filePath,
      timestamp: Date.now(),
    });

    // Auto-cleanup after correlation window
    setTimeout(() => {
      this.pendingCreates.delete(normalized);
    }, this.correlationWindow);
  }

  /**
   * Check if a CREATE event is actually a rename (DELETE came first).
   *
   * @param newPath - The path of the created file
   * @returns The old path if this is a rename, null otherwise
   */
  matchCreateWithDelete(newPath: string): string | null {
    const newDirNormalized = this.normalizePath(path.dirname(newPath));
    const newPathNormalized = this.normalizePath(newPath);
    const now = Date.now();

    for (const [oldPathNormalized, entry] of this.pendingDeletes.entries()) {
      // Must be within correlation window
      if (now - entry.timestamp > this.correlationWindow) {
        continue;
      }

      // Must be in same directory (rename, not move)
      // Use normalized comparison for case-insensitive filesystems
      const oldDirNormalized = this.normalizePath(
        path.dirname(entry.originalPath),
      );
      if (oldDirNormalized !== newDirNormalized) {
        continue;
      }

      // Must be different paths (use normalized comparison)
      if (oldPathNormalized === newPathNormalized) {
        continue;
      }

      // Found a match - consume the pending delete
      this.pendingDeletes.delete(oldPathNormalized);
      return entry.originalPath;
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
    const oldDirNormalized = this.normalizePath(path.dirname(oldPath));
    const oldPathNormalized = this.normalizePath(oldPath);
    const now = Date.now();

    for (const [newPathNormalized, entry] of this.pendingCreates.entries()) {
      // Must be within correlation window
      if (now - entry.timestamp > this.correlationWindow) {
        continue;
      }

      // Must be in same directory (rename, not move)
      // Use normalized comparison for case-insensitive filesystems
      const newDirNormalized = this.normalizePath(
        path.dirname(entry.originalPath),
      );
      if (newDirNormalized !== oldDirNormalized) {
        continue;
      }

      // Must be different paths (use normalized comparison)
      if (oldPathNormalized === newPathNormalized) {
        continue;
      }

      // Found a match - consume the pending create
      this.pendingCreates.delete(newPathNormalized);
      return entry.originalPath;
    }

    return null;
  }

  /**
   * Clear all pending events.
   */
  clear(): void {
    this.pendingDeletes.clear();
    this.pendingCreates.clear();
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
/** Watchers holding a native subscription. */
const liveWatchers = new Set<ParcelFileWatcher>();

/**
 * Unsubscribe every live watcher. An FSEvents callback that lands while Node
 * is tearing down aborts the process, so quit waits for this first.
 */
export async function unwatchAll(): Promise<void> {
  await Promise.all(Array.from(liveWatchers, (watcher) => watcher.unwatch()));
}

export class ParcelFileWatcher {
  /** The directory being watched */
  readonly path: string;

  /** `path` with symlinks resolved, which is how FSEvents reports it */
  private readonly realPath: string;

  /** Ignore patterns */
  private readonly ignored: string[];

  /** The @parcel/watcher subscription */
  private subscription: AsyncSubscription | null = null;

  /** Whether currently watching */
  private watching = false;

  /** The in-flight unsubscribe, if any */
  private unwatching: Promise<void> | null = null;

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
        backend: "fs-events",
        ignore: this.ignored,
      },
    );

    this.watching = true;
    liveWatchers.add(this);
  }

  /**
   * Stop watching for file changes. Concurrent calls share one unsubscribe.
   */
  unwatch(): Promise<void> {
    if (!this.watching || !this.subscription) {
      return Promise.resolve();
    }

    this.unwatching ??= this.subscription
      .unsubscribe()
      .then(() => {
        this.subscription = null;
        this.watching = false;
        liveWatchers.delete(this);

        this.clearDebounceTimers();
        this.renameDetector.clear();
      })
      .finally(() => {
        this.unwatching = null;
      });

    return this.unwatching;
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
   * Handle a batch of events from @parcel/watcher.
   */
  private handleEvents(
    events: Array<{ type: "create" | "update" | "delete"; path: string }>,
  ): void {
    for (const event of events) {
      const filePath = this.toWatchedPath(event.path);

      // Double-check ignore patterns (parcel's ignore is best-effort)
      if (this.shouldIgnore(filePath)) {
        continue;
      }

      switch (event.type) {
        case "create":
          this.handleCreate(filePath);
          break;
        case "update":
          this.handleUpdate(filePath);
          break;
        case "delete":
          this.handleDelete(filePath);
          break;
      }
    }
  }

  /**
   * FSEvents reports realpaths, so a folder opened through a symlink (such as
   * /tmp → /private/tmp) gets events under a path its callers never used.
   * Map them back under the watched path, so they match callers' keys.
   */
  private toWatchedPath(filePath: string): string {
    const inside =
      filePath === this.realPath ||
      filePath.startsWith(this.realPath + path.sep);
    return inside
      ? path.join(this.path, filePath.slice(this.realPath.length))
      : filePath;
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
   *
   * Matching is case-insensitive, like the macOS filesystem.
   */
  private matchPattern(filePath: string, pattern: string): boolean {
    const normalizedPath = filePath.toLowerCase();
    const normalizedPattern = pattern.toLowerCase();

    // Handle `**/dir/**` pattern (match path containing /dir/)
    const dirMatch = normalizedPattern.match(/^\*\*\/(.+)\/\*\*$/);
    if (dirMatch) {
      const dirName = dirMatch[1];
      return (
        normalizedPath.includes(`/${dirName}/`) ||
        normalizedPath.startsWith(`${dirName}/`) ||
        normalizedPath.endsWith(`/${dirName}`)
      );
    }

    // Handle `**/*.ext` pattern (match files with extension)
    const extMatch = normalizedPattern.match(/^\*\*\/\*(\.[^/]+)$/);
    if (extMatch) {
      return normalizedPath.endsWith(extMatch[1]);
    }

    // Handle `**/name` pattern (match files/dirs named exactly)
    const nameMatch = normalizedPattern.match(/^\*\*\/(.+)$/);
    if (nameMatch) {
      const name = nameMatch[1];
      return normalizedPath.endsWith(`/${name}`) || normalizedPath === name;
    }

    // Fallback: check if pattern (as literal) is in path
    return normalizedPath.includes(normalizedPattern);
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
