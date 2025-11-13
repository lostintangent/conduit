import chokidar from "chokidar";
import { BrowserWindow } from "electron";
import path from "node:path";
import { findRepoRoot } from "../agent/git";
import type {
  FileChangedEvent,
  FileRenamedEvent,
  FileWatcherSubscription,
  TreeChangedEvent,
  UnlinkMetadata,
  WatcherEntry,
} from "./types";

/**
 * Centralized file watching service that manages file system watchers
 * and notifies subscribers of changes.
 *
 * This service uses a singleton pattern to ensure only one instance exists
 * throughout the application lifecycle. It manages multiple watchers for
 * different directories and coordinates event broadcasting to subscribed panes.
 */
export class FileWatcherService {
  private static instance: FileWatcherService | null = null;

  /**
   * Map of directory paths (cwd) to their corresponding watcher entries.
   * Each entry contains the file system watcher and its subscribers.
   */
  private watchers: Map<string, WatcherEntry> = new Map();

  /**
   * Map of debounce timer keys to their timeout handles.
   * Used to batch rapid file system events.
   */
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Map of recently deleted file paths to their metadata.
   * Used to detect file renames (unlink followed by add with matching metadata).
   * Entries are automatically cleaned up after 500ms.
   */
  private recentUnlinks: Map<string, UnlinkMetadata> = new Map();

  /**
   * Private constructor to enforce singleton pattern.
   */
  private constructor() {
    // Singleton instance
  }

  /**
   * Gets the singleton instance of the FileWatcherService.
   * Creates the instance if it doesn't exist yet.
   */
  public static getInstance(): FileWatcherService {
    if (!FileWatcherService.instance) {
      FileWatcherService.instance = new FileWatcherService();
    }
    return FileWatcherService.instance;
  }

  /**
   * Subscribe a pane to file watching for a specific directory.
   *
   * @param cwd - The directory path to watch
   * @param paneId - Unique identifier for the pane
   * @param windowId - Browser window ID for event broadcasting
   */
  public async subscribe(
    cwd: string,
    paneId: string,
    windowId: number,
  ): Promise<void> {
    // Normalize the path
    const normalizedCwd = path.resolve(cwd);

    // Get or create watcher entry
    let entry = this.watchers.get(normalizedCwd);
    const isNewWatcher = !entry;

    if (!entry) {
      // Create new watcher entry
      entry = {
        fsWatcher: null,
        subscribers: new Set(),
        gitRoot: null,
      };
      this.watchers.set(normalizedCwd, entry);
    }

    // Add subscriber
    const subscription: FileWatcherSubscription = { paneId, windowId };
    entry.subscribers.add(subscription);
    console.log(
      `[FileWatcher] Subscriber added: paneId=${paneId}, windowId=${windowId}, cwd=${normalizedCwd}`,
    );

    // Setup watcher if this is the first subscriber
    if (entry.fsWatcher === null) {
      await this.setupWatcher(normalizedCwd);
      if (isNewWatcher) {
        console.log(`[FileWatcher] Watcher created for cwd=${normalizedCwd}`);
      }
    }

    console.log(
      `[FileWatcher] Active watchers: ${this.watchers.size}, Subscribers for ${normalizedCwd}: ${entry.subscribers.size}`,
    );
  }

  /**
   * Unsubscribe a pane from file watching.
   *
   * @param cwd - The directory path being watched
   * @param paneId - Unique identifier for the pane
   */
  public unsubscribe(cwd: string, paneId: string): void {
    const normalizedCwd = path.resolve(cwd);
    const entry = this.watchers.get(normalizedCwd);

    if (!entry) {
      console.log(
        `[FileWatcher] Unsubscribe called but no watcher found: paneId=${paneId}, cwd=${normalizedCwd}`,
      );
      return;
    }

    const beforeSize = entry.subscribers.size;

    // Remove subscriber
    entry.subscribers = new Set(
      Array.from(entry.subscribers).filter((sub) => sub.paneId !== paneId),
    );

    if (entry.subscribers.size < beforeSize) {
      console.log(
        `[FileWatcher] Subscriber removed: paneId=${paneId}, cwd=${normalizedCwd}`,
      );
    }

    // Cleanup watcher if no subscribers left
    if (entry.subscribers.size === 0) {
      console.log(
        `[FileWatcher] No subscribers left, cleaning up watcher for cwd=${normalizedCwd}`,
      );
      this.cleanupWatcher(normalizedCwd);
      this.watchers.delete(normalizedCwd);
      console.log(
        `[FileWatcher] Watcher destroyed for cwd=${normalizedCwd}. Active watchers: ${this.watchers.size}`,
      );
    } else {
      console.log(
        `[FileWatcher] Subscribers remaining for ${normalizedCwd}: ${entry.subscribers.size}`,
      );
    }
  }

  /**
   * Check if a pane is subscribed to watching a directory.
   *
   * @param cwd - The directory path
   * @param paneId - Unique identifier for the pane
   * @returns true if the pane is subscribed
   */
  public isSubscribed(cwd: string, paneId: string): boolean {
    const normalizedCwd = path.resolve(cwd);
    const entry = this.watchers.get(normalizedCwd);

    if (!entry) {
      return false;
    }

    return Array.from(entry.subscribers).some((sub) => sub.paneId === paneId);
  }

  /**
   * Setup a file system watcher for a directory.
   *
   * @param cwd - The directory path to watch
   */
  private async setupWatcher(cwd: string): Promise<void> {
    const entry = this.watchers.get(cwd);
    if (!entry) {
      return;
    }

    try {
      console.log(`[FileWatcher] Setting up watcher for cwd=${cwd}`);

      // Detect git root
      entry.gitRoot = await findRepoRoot(cwd);
      if (entry.gitRoot) {
        console.log(
          `[FileWatcher] Git root detected: ${entry.gitRoot} for cwd=${cwd}`,
        );
      }

      // Create chokidar watcher
      const watcher = chokidar.watch(cwd, {
        ignored: [
          /(^|[/\\])\../, // Hidden files/directories
          "**/node_modules/**",
          "**/dist/**",
          "**/out/**",
          "**/.git/**",
        ],
        ignoreInitial: true,
        persistent: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
        // Use polling on macOS to avoid EMFILE errors in large repos
        // Polling is more reliable than fs.watch() which can hit file descriptor limits
        usePolling: process.platform === "darwin",
        interval: 1000, // Poll every second
      });

      // Attach event handlers
      watcher
        .on("change", (filePath) => this.handleFileChange(cwd, filePath))
        .on("add", (filePath) => this.handleFileAdded(cwd, filePath))
        .on("unlink", (filePath) => this.handleFileDeleted(cwd, filePath))
        .on("addDir", (dirPath) => this.handleDirectoryAdded(cwd, dirPath))
        .on("unlinkDir", (dirPath) => this.handleDirectoryDeleted(cwd, dirPath))
        .on("error", (error) =>
          console.error(`[FileWatcher] Watcher error for ${cwd}:`, error),
        );

      entry.fsWatcher = watcher;
      console.log(`[FileWatcher] Watcher setup complete for cwd=${cwd}`);
    } catch (error) {
      console.error(`[FileWatcher] Failed to setup watcher for ${cwd}:`, error);
    }
  }

  /**
   * Cleanup and close a file system watcher.
   *
   * @param cwd - The directory path being watched
   */
  private cleanupWatcher(cwd: string): void {
    const entry = this.watchers.get(cwd);
    if (!entry) {
      return;
    }

    // Close the watcher
    if (entry.fsWatcher) {
      entry.fsWatcher.close();
      entry.fsWatcher = null;
    }

    // Clear any pending debounce timers for this cwd
    const keysToDelete: string[] = [];
    for (const [key] of this.debounceTimers) {
      if (key.startsWith(`${cwd}:`)) {
        clearTimeout(this.debounceTimers.get(key));
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => this.debounceTimers.delete(key));
  }

  /**
   * Handle file change events.
   *
   * @param cwd - The watched directory
   * @param filePath - The changed file path
   */
  private handleFileChange(cwd: string, filePath: string): void {
    const relativePath = path.relative(cwd, filePath);
    console.log(
      `[FileWatcher] File changed: ${relativePath} in cwd=${cwd} (debouncing 50ms)`,
    );

    // Debounce to avoid spam
    this.debounce(`${cwd}:file-change:${filePath}`, 50, () => {
      console.log(
        `[FileWatcher] Broadcasting file-changed event for ${relativePath}`,
      );
      const event: FileChangedEvent = {
        cwd,
        filePath,
        relativePath,
        eventType: "changed",
      };
      this.broadcast(cwd, "file-watcher:file-changed", event);
    });
  }

  /**
   * Handle file added events.
   *
   * @param cwd - The watched directory
   * @param filePath - The added file path
   */
  private handleFileAdded(cwd: string, filePath: string): void {
    // Check if this is likely a rename
    const renamedFrom = this.detectRename(cwd, filePath);

    if (renamedFrom) {
      // This is a rename - broadcast rename event
      const oldRelativePath = path.relative(cwd, renamedFrom);
      const newRelativePath = path.relative(cwd, filePath);

      console.log(
        `[FileWatcher] File renamed: ${oldRelativePath} → ${newRelativePath} in cwd=${cwd}`,
      );

      // Cancel the pending deletion notification for the old file
      // This prevents the brief "file deleted" flash in the UI
      const deletionKey = `${cwd}:file-deletion:${renamedFrom}`;
      const existingTimer = this.debounceTimers.get(deletionKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.debounceTimers.delete(deletionKey);
        console.log(
          `[FileWatcher] Cancelled deletion notification for ${oldRelativePath} (detected as rename)`,
        );
      }

      const renameEvent: FileRenamedEvent = {
        cwd,
        oldPath: renamedFrom,
        newPath: filePath,
        oldRelativePath,
        newRelativePath,
      };

      this.broadcast(cwd, "file-watcher:file-renamed", renameEvent);

      // Still trigger tree change (file list changed)
      this.debounce(`${cwd}:tree-change`, 100, () => {
        const event: TreeChangedEvent = { cwd };
        this.broadcast(cwd, "file-watcher:tree-changed", event);
      });
    } else {
      // Normal file addition
      this.debounce(`${cwd}:tree-change`, 100, () => {
        const event: TreeChangedEvent = { cwd };
        this.broadcast(cwd, "file-watcher:tree-changed", event);
      });
    }
  }

  /**
   * Handle file deleted events.
   *
   * @param cwd - The watched directory
   * @param filePath - The deleted file path
   */
  private handleFileDeleted(cwd: string, filePath: string): void {
    const relativePath = path.relative(cwd, filePath);
    console.log(`[FileWatcher] File deleted: ${relativePath} in cwd=${cwd}`);

    // Store metadata for potential rename detection
    // We use a simple heuristic: timestamp + file size from stat before deletion
    // Note: File is already gone, but we'll track recent unlinks by path
    this.recentUnlinks.set(filePath, {
      timestamp: Date.now(),
      size: 0, // Will be populated if we had stats
      mtimeMs: 0,
    });

    // Clean up old entries after 500ms
    setTimeout(() => {
      this.recentUnlinks.delete(filePath);
    }, 500);

    // Debounce deletion notification to prevent flashing in case of rename
    // If a rename is detected, the pending deletion notification will be cancelled
    this.debounce(`${cwd}:file-deletion:${filePath}`, 200, () => {
      console.log(
        `[FileWatcher] Broadcasting file-deleted event for ${relativePath}`,
      );
      const event: FileChangedEvent = {
        cwd,
        filePath,
        relativePath,
        eventType: "deleted",
      };
      this.broadcast(cwd, "file-watcher:file-changed", event);
    });

    // Debounce tree refresh
    this.debounce(`${cwd}:tree-change`, 100, () => {
      console.log(
        `[FileWatcher] Broadcasting tree-changed event for deletion in cwd=${cwd}`,
      );
      const treeEvent: TreeChangedEvent = { cwd };
      this.broadcast(cwd, "file-watcher:tree-changed", treeEvent);
    });
  }

  /**
   * Handle directory added events.
   *
   * @param cwd - The watched directory
   * @param _dirPath - The added directory path
   */
  private handleDirectoryAdded(cwd: string, _dirPath: string): void {
    // Debounce to batch rapid additions
    this.debounce(`${cwd}:tree-change`, 100, () => {
      const event: TreeChangedEvent = { cwd };
      this.broadcast(cwd, "file-watcher:tree-changed", event);
    });
  }

  /**
   * Handle directory deleted events.
   *
   * @param cwd - The watched directory
   * @param _dirPath - The deleted directory path
   */
  private handleDirectoryDeleted(cwd: string, _dirPath: string): void {
    // Debounce to batch rapid deletions
    this.debounce(`${cwd}:tree-change`, 100, () => {
      const event: TreeChangedEvent = { cwd };
      this.broadcast(cwd, "file-watcher:tree-changed", event);
    });
  }

  /**
   * Detect if a file addition is actually a rename operation.
   *
   * Uses a heuristic approach: checks if there was a recent unlink event
   * in the same directory within 500ms with matching file metadata.
   *
   * @param cwd - The watched directory
   * @param newFilePath - The path of the newly added file
   * @returns The path of the old file if rename detected, null otherwise
   */
  private detectRename(cwd: string, newFilePath: string): string | null {
    try {
      const newDir = path.dirname(newFilePath);

      // Look for recent unlinks with matching metadata
      for (const [oldPath, metadata] of this.recentUnlinks.entries()) {
        const timeDiff = Date.now() - metadata.timestamp;

        // Must be within 500ms window
        if (timeDiff > 500) continue;

        const oldDir = path.dirname(oldPath);

        // Must be in the same directory (simple rename, not move)
        if (oldDir !== newDir) continue;

        // For now, we use a simple heuristic: if unlink + add happen in same
        // directory within 500ms, it's likely a rename
        // In the future, we could enhance this by comparing file size/mtime

        // Remove from tracking map
        this.recentUnlinks.delete(oldPath);

        console.log(
          `[FileWatcher] Detected rename: ${path.relative(cwd, oldPath)} → ${path.relative(cwd, newFilePath)}`,
        );

        return oldPath;
      }
    } catch (error) {
      // Can't stat new file or other error
      console.error(`[FileWatcher] Error detecting rename:`, error);
    }

    return null;
  }

  /**
   * Broadcast an event to all subscribers of a watched directory.
   *
   * @param cwd - The watched directory
   * @param event - The event name
   * @param data - The event payload
   */
  private broadcast(cwd: string, event: string, data: unknown): void {
    const entry = this.watchers.get(cwd);
    if (!entry) {
      return;
    }

    // Track dead subscribers
    const deadSubscribers: FileWatcherSubscription[] = [];

    // Send event to each subscriber
    for (const subscriber of entry.subscribers) {
      const window = BrowserWindow.fromId(subscriber.windowId);

      if (window && !window.isDestroyed()) {
        window.webContents.send(event, data);
      } else {
        console.log(
          `[FileWatcher] Dead subscriber detected: paneId=${subscriber.paneId}, windowId=${subscriber.windowId}`,
        );
        deadSubscribers.push(subscriber);
      }
    }

    // Cleanup dead subscribers
    if (deadSubscribers.length > 0) {
      console.log(
        `[FileWatcher] Cleaning up ${deadSubscribers.length} dead subscriber(s) for cwd=${cwd}`,
      );
      for (const deadSub of deadSubscribers) {
        entry.subscribers.delete(deadSub);
      }

      // Cleanup watcher if no subscribers left
      if (entry.subscribers.size === 0) {
        console.log(
          `[FileWatcher] No subscribers left after cleanup, destroying watcher for cwd=${cwd}`,
        );
        this.cleanupWatcher(cwd);
        this.watchers.delete(cwd);
      }
    }
  }

  /**
   * Debounce a callback function.
   *
   * @param key - Unique key for this debounce timer
   * @param delay - Delay in milliseconds
   * @param callback - Function to execute after delay
   */
  private debounce(key: string, delay: number, callback: () => void): void {
    // Clear existing timer
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Create new timer
    const timer = setTimeout(() => {
      callback();
      this.debounceTimers.delete(key);
    }, delay);

    this.debounceTimers.set(key, timer);
  }
}
