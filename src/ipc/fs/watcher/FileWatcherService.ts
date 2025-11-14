import chokidar from "chokidar";
import { BrowserWindow } from "electron";
import path from "node:path";
import type {
  WatcherEntry,
  FileWatcherSubscription,
  FileChangedEvent,
  TreeChangedEvent,
  FileRenamedEvent,
  UnlinkMetadata,
  GitStatusChangedEvent,
} from "./types";
import { findRepoRoot } from "../../agent/git";
import {
  getGitStatus,
  getGitStatusForFile,
  listBranches,
} from "../../git/gitStatus";
import type { GitStatusMap } from "@shared/types";

/**
 * Configuration options for FileWatcherService
 */
export interface FileWatcherConfig {
  /** Disable git watcher setup (useful for testing file watching in isolation) */
  disableGitWatcher?: boolean;
  /** Override default git status batch window (default: 100ms) */
  gitStatusBatchWindowMs?: number;
  /** Override default git status batch threshold (default: 5 files) */
  gitStatusBatchThreshold?: number;
}

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
   * Configuration for git status batching.
   * When multiple files change within the batch window, we decide whether to
   * run a full git status or individual per-file git status based on the count.
   */
  private readonly GIT_STATUS_BATCH_WINDOW_MS: number;
  private readonly GIT_STATUS_BATCH_THRESHOLD: number;
  private readonly disableGitWatcher: boolean;

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
  private constructor(config: FileWatcherConfig = {}) {
    this.disableGitWatcher = config.disableGitWatcher ?? false;
    this.GIT_STATUS_BATCH_WINDOW_MS = config.gitStatusBatchWindowMs ?? 100;
    this.GIT_STATUS_BATCH_THRESHOLD = config.gitStatusBatchThreshold ?? 5;
  }

  /**
   * Gets the singleton instance of the FileWatcherService.
   * Creates the instance if it doesn't exist yet.
   *
   * @param config - Optional configuration for the service
   */
  public static getInstance(config?: FileWatcherConfig): FileWatcherService {
    if (!FileWatcherService.instance) {
      FileWatcherService.instance = new FileWatcherService(config);
    }
    return FileWatcherService.instance;
  }

  /**
   * Reset the singleton instance (useful for testing).
   * @internal
   */
  public static resetInstance(): void {
    FileWatcherService.instance = null;
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

    if (!entry) {
      // Create new watcher entry
      entry = {
        fsWatcher: null,
        gitWatcher: null,
        subscribers: new Set(),
        gitRoot: null,
        gitStatus: null,
        baseBranch: null,
        branches: null,
        gitStatusFullDebounceTimer: null,
        gitStatusFileDebounceTimers: new Map(),
        setupInProgress: false,
        pendingGitStatusFiles: new Set(),
        gitStatusBatchTimer: null,
      };
      this.watchers.set(normalizedCwd, entry);
    }

    // Add subscriber
    const subscription: FileWatcherSubscription = { paneId, windowId };
    entry.subscribers.add(subscription);
    console.log(
      `[FileWatcher] Subscriber added: paneId=${paneId}, windowId=${windowId}, cwd=${normalizedCwd}`,
    );

    // Setup watcher if not already set up and not currently setting up
    if (entry.fsWatcher === null && !entry.setupInProgress) {
      entry.setupInProgress = true;
      console.log(
        `[FileWatcher] Starting watcher setup for cwd=${normalizedCwd}`,
      );

      // Setup watcher asynchronously - don't block subscription
      this.setupWatcher(normalizedCwd)
        .then(() => {
          console.log(
            `[FileWatcher] Watcher setup completed for cwd=${normalizedCwd}`,
          );
        })
        .catch((error) => {
          console.error(
            `[FileWatcher] Failed to setup watcher for ${normalizedCwd}:`,
            error,
          );
        })
        .finally(() => {
          const e = this.watchers.get(normalizedCwd);
          if (e) {
            e.setupInProgress = false;
          }
        });
    } else if (entry.setupInProgress) {
      console.log(
        `[FileWatcher] Watcher setup already in progress for cwd=${normalizedCwd}`,
      );
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
      console.time(`[FileWatcher] findRepoRoot for ${cwd}`);
      entry.gitRoot = await findRepoRoot(cwd);
      console.timeEnd(`[FileWatcher] findRepoRoot for ${cwd}`);

      if (entry.gitRoot) {
        console.log(
          `[FileWatcher] Git root detected: ${entry.gitRoot} for cwd=${cwd}`,
        );

        // Compute initial git status
        console.time(`[FileWatcher] Initial git status for ${cwd}`);
        await this.computeGitStatusFull(cwd);
        console.timeEnd(`[FileWatcher] Initial git status for ${cwd}`);

        // Load branches list (cached for subsequent calls)
        console.time(`[FileWatcher] Load branches for ${cwd}`);
        entry.branches = await listBranches(entry.gitRoot);
        console.timeEnd(`[FileWatcher] Load branches for ${cwd}`);
        console.log(`[FileWatcher] Loaded ${entry.branches.length} branches`);

        // Setup git watcher to watch .git directory for changes
        if (!this.disableGitWatcher) {
          this.setupGitWatcher(cwd, entry.gitRoot);
        }
      }

      // Create chokidar watcher with conservative file descriptor usage
      const watcher = chokidar.watch(cwd, {
        ignored: [
          /(^|[/\\])\../, // Hidden files/directories (except .vscode, .claude, etc.)
          "**/node_modules/**",
          "**/dist/**",
          "**/out/**",
          "**/.git/**",
          "**/dist/**",
          "**/build/**",
          "**/.vite/**",
          "**/out/**",
          "**/.next/**",
          "**/.cache/**",
          "**/coverage/**",
          "**/*.log",
          "**/.DS_Store",
        ],
        ignoreInitial: true,
        persistent: true,
        // Use polling on macOS to avoid EMFILE errors with large directories
        // Polling uses fewer file descriptors but is slightly slower
        usePolling: process.platform === "darwin",
        interval: 1000, // Poll every second (only used if usePolling is true)
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
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

    // Close the fs watcher
    if (entry.fsWatcher) {
      entry.fsWatcher.close();
      entry.fsWatcher = null;
    }

    // Close the git watcher
    if (entry.gitWatcher) {
      entry.gitWatcher.close();
      entry.gitWatcher = null;
    }

    // Clear git status full debounce timer
    if (entry.gitStatusFullDebounceTimer) {
      clearTimeout(entry.gitStatusFullDebounceTimer);
      entry.gitStatusFullDebounceTimer = null;
    }

    // Clear all per-file git status timers
    for (const timer of entry.gitStatusFileDebounceTimers.values()) {
      clearTimeout(timer);
    }
    entry.gitStatusFileDebounceTimers.clear();

    // Clear batch timer and pending files
    if (entry.gitStatusBatchTimer) {
      clearTimeout(entry.gitStatusBatchTimer);
      entry.gitStatusBatchTimer = null;
    }
    entry.pendingGitStatusFiles.clear();

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

    // Schedule git status update for this specific file
    const entry = this.watchers.get(cwd);
    if (entry && entry.gitRoot) {
      this.scheduleGitStatusUpdateFile(cwd, filePath);
    }
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

    // Schedule git status update for the added file
    const entry = this.watchers.get(cwd);
    if (entry && entry.gitRoot) {
      this.scheduleGitStatusUpdateFile(cwd, filePath);
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

    // Remove from git status map if in git repo
    const entry = this.watchers.get(cwd);
    if (entry && entry.gitRoot && entry.gitStatus) {
      const gitRelativePath = path.relative(cwd, filePath);
      const wasRemoved = entry.gitStatus.delete(gitRelativePath);
      if (wasRemoved) {
        console.log(
          `[FileWatcher] Removed from git status: ${gitRelativePath}`,
        );
        this.broadcastGitStatusChanged(cwd);
      }
    }

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

  /**
   * Setup git watcher to monitor .git directory changes
   *
   * @param cwd - The directory path
   * @param gitRoot - The git repository root
   */
  private setupGitWatcher(cwd: string, gitRoot: string): void {
    const entry = this.watchers.get(cwd);
    if (!entry) {
      return;
    }

    try {
      // Watch .git directory for git operations
      const gitWatcher = chokidar.watch(
        [
          path.join(gitRoot, ".git/index"),
          path.join(gitRoot, ".git/HEAD"),
          path.join(gitRoot, ".git/refs"),
        ],
        {
          ignoreInitial: true,
          persistent: true,
          // Use polling on macOS to reduce file descriptor usage
          usePolling: process.platform === "darwin",
          interval: 500, // Poll twice per second (faster than main watcher for git responsiveness)
          awaitWriteFinish: {
            stabilityThreshold: 50,
            pollInterval: 25,
          },
        },
      );

      gitWatcher.on("change", () => {
        console.log(`[FileWatcher] Git change detected for cwd=${cwd}`);
        // Invalidate branches cache as branches may have changed
        if (entry) {
          entry.branches = null;
        }
        this.scheduleGitStatusUpdateFull(cwd, 200);
      });

      gitWatcher.on("add", () => {
        console.log(`[FileWatcher] Git add detected for cwd=${cwd}`);
        // Invalidate branches cache as branches may have changed
        if (entry) {
          entry.branches = null;
        }
        this.scheduleGitStatusUpdateFull(cwd, 200);
      });

      gitWatcher.on("error", (error) =>
        console.error(`[FileWatcher] Git watcher error for ${cwd}:`, error),
      );

      entry.gitWatcher = gitWatcher;
      console.log(`[FileWatcher] Git watcher setup complete for cwd=${cwd}`);
    } catch (error) {
      console.error(
        `[FileWatcher] Failed to setup git watcher for ${cwd}:`,
        error,
      );
    }
  }

  /**
   * Compute full git status for a directory (all files)
   *
   * @param cwd - The directory path
   */
  private async computeGitStatusFull(cwd: string): Promise<void> {
    const entry = this.watchers.get(cwd);
    if (!entry || !entry.gitRoot) {
      return;
    }

    try {
      console.log(
        `[FileWatcher] Computing full git status for cwd=${cwd}, baseBranch=${entry.baseBranch || "HEAD"}`,
      );

      const gitStatus = await getGitStatus(cwd, entry.baseBranch);
      entry.gitStatus = gitStatus;

      console.log(
        `[FileWatcher] Git status computed: ${gitStatus?.size || 0} files with changes`,
      );

      // Broadcast git status update
      this.broadcastGitStatusChanged(cwd);
    } catch (error) {
      console.error(
        `[FileWatcher] Failed to compute git status for ${cwd}:`,
        error,
      );
    }
  }

  /**
   * Compute git status for a single file
   *
   * @param cwd - The directory path
   * @param filePath - Absolute path to the file
   */
  private async computeGitStatusForFile(
    cwd: string,
    filePath: string,
  ): Promise<void> {
    const entry = this.watchers.get(cwd);
    if (!entry || !entry.gitRoot || !entry.gitStatus) {
      return;
    }

    try {
      const fileStatus = await getGitStatusForFile(entry.gitRoot, filePath);
      const relativePath = path.relative(cwd, filePath);

      if (fileStatus) {
        // Update the status map
        entry.gitStatus.set(relativePath, fileStatus);
        console.log(
          `[FileWatcher] Updated git status for file: ${relativePath} -> ${fileStatus.status}`,
        );
      } else {
        // File is unmodified, remove from map
        const hadStatus = entry.gitStatus.delete(relativePath);
        if (hadStatus) {
          console.log(
            `[FileWatcher] Removed git status for file (now unmodified): ${relativePath}`,
          );
        }
      }

      // Broadcast git status update
      this.broadcastGitStatusChanged(cwd);
    } catch (error) {
      console.error(
        `[FileWatcher] Failed to compute git status for file ${filePath}:`,
        error,
      );
    }
  }

  /**
   * Schedule a full git status update with debouncing
   *
   * @param cwd - The directory path
   * @param delay - Delay in milliseconds (default: 200ms)
   */
  private scheduleGitStatusUpdateFull(cwd: string, delay = 200): void {
    const entry = this.watchers.get(cwd);
    if (!entry) {
      return;
    }

    // Clear existing timer
    if (entry.gitStatusFullDebounceTimer) {
      clearTimeout(entry.gitStatusFullDebounceTimer);
    }

    // Set new timer
    entry.gitStatusFullDebounceTimer = setTimeout(async () => {
      await this.computeGitStatusFull(cwd);
      entry.gitStatusFullDebounceTimer = null;
    }, delay);
  }

  /**
   * Schedule a single-file git status update with batching.
   * Collects file changes within a time window and decides whether to
   * run full git status (if many files changed) or per-file git status.
   *
   * @param cwd - The directory path
   * @param filePath - Absolute path to the file
   */
  private scheduleGitStatusUpdateFile(cwd: string, filePath: string): void {
    const entry = this.watchers.get(cwd);
    if (!entry) {
      return;
    }

    // Add file to pending batch
    entry.pendingGitStatusFiles.add(filePath);

    // Clear existing batch timer
    if (entry.gitStatusBatchTimer) {
      clearTimeout(entry.gitStatusBatchTimer);
    }

    // Set new batch timer
    entry.gitStatusBatchTimer = setTimeout(async () => {
      await this.processBatchedGitStatusUpdates(cwd);
    }, this.GIT_STATUS_BATCH_WINDOW_MS);
  }

  /**
   * Process batched git status updates.
   * Decides whether to run full git status or per-file updates based on batch size.
   *
   * @param cwd - The directory path
   */
  private async processBatchedGitStatusUpdates(cwd: string): Promise<void> {
    const entry = this.watchers.get(cwd);
    if (!entry) {
      return;
    }

    // Get pending files and clear the buffer
    const pendingFiles = Array.from(entry.pendingGitStatusFiles);
    entry.pendingGitStatusFiles.clear();
    entry.gitStatusBatchTimer = null;

    if (pendingFiles.length === 0) {
      return;
    }

    console.log(
      `[FileWatcher] Processing batched git status update: ${pendingFiles.length} file(s) changed in cwd=${cwd}`,
    );

    // Decide strategy based on threshold
    if (pendingFiles.length > this.GIT_STATUS_BATCH_THRESHOLD) {
      // Many files changed - use full git status
      console.log(
        `[FileWatcher] Using full git status (threshold exceeded: ${pendingFiles.length} > ${this.GIT_STATUS_BATCH_THRESHOLD})`,
      );
      await this.computeGitStatusFull(cwd);
    } else {
      // Few files changed - use per-file git status
      console.log(
        `[FileWatcher] Using per-file git status for ${pendingFiles.length} file(s)`,
      );
      for (const filePath of pendingFiles) {
        await this.computeGitStatusForFile(cwd, filePath);
      }
    }
  }

  /**
   * Broadcast git status changed event to subscribers
   *
   * @param cwd - The directory path
   */
  private broadcastGitStatusChanged(cwd: string): void {
    const entry = this.watchers.get(cwd);
    if (!entry) {
      return;
    }

    // Convert Map to plain object for IPC serialization
    const gitStatusObj = entry.gitStatus
      ? Object.fromEntries(entry.gitStatus.entries())
      : null;

    const event: GitStatusChangedEvent = {
      cwd,
      gitStatus: gitStatusObj as any, // Type cast since event expects Map but we're sending serializable object
      baseBranch: entry.baseBranch,
    };

    this.broadcast(cwd, "git:status-changed", event);
  }

  /**
   * Set the base branch for git comparison
   *
   * @param cwd - The directory path
   * @param baseBranch - Name of the base branch, or null for HEAD mode
   */
  public async setBaseBranch(
    cwd: string,
    baseBranch: string | null,
  ): Promise<void> {
    const normalizedCwd = path.resolve(cwd);
    const entry = this.watchers.get(normalizedCwd);

    if (!entry) {
      console.log(
        `[FileWatcher] setBaseBranch called but no watcher found for cwd=${normalizedCwd}`,
      );
      return;
    }

    entry.baseBranch = baseBranch;
    console.log(
      `[FileWatcher] Base branch set to: ${baseBranch || "HEAD"} for cwd=${normalizedCwd}`,
    );

    // Trigger full git status recomputation
    await this.computeGitStatusFull(normalizedCwd);
  }

  /**
   * Get current git status for a directory
   *
   * @param cwd - The directory path
   * @returns Git status map, or null if no watcher or not in git repo
   */
  public getGitStatus(cwd: string): GitStatusMap | null {
    const normalizedCwd = path.resolve(cwd);
    const entry = this.watchers.get(normalizedCwd);
    return entry?.gitStatus || null;
  }

  /**
   * Get list of branches for a directory
   *
   * @param cwd - The directory path
   * @returns Array of branch information
   */
  public async getBranches(cwd: string): Promise<any[]> {
    const normalizedCwd = path.resolve(cwd);
    const entry = this.watchers.get(normalizedCwd);

    if (!entry || !entry.gitRoot) {
      return [];
    }

    // Return cached branches if available, otherwise load fresh
    if (entry.branches !== null) {
      return entry.branches;
    }

    // Load and cache branches
    entry.branches = await listBranches(entry.gitRoot);
    return entry.branches;
  }

  /**
   * Manually refresh git status for a directory
   *
   * @param cwd - The directory path
   */
  public async refreshGitStatus(cwd: string): Promise<void> {
    const normalizedCwd = path.resolve(cwd);
    await this.computeGitStatusFull(normalizedCwd);
  }
}
