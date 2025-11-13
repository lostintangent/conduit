import { BrowserWindow } from "electron";
import path from "node:path";
import { ParcelFileSystemWatcher } from "./ParcelFileSystemWatcher";
import { ParcelGitWatcher } from "./ParcelGitWatcher";
import { findRepoRoot } from "../../agent/git";
import { listBranches } from "../../git/gitStatus";
import type { IFileSystemWatcher } from "./IFileSystemWatcher";
import type { IGitWatcher } from "./IGitWatcher";
import type { FileWatcherSubscription, GitStatusChangedEvent } from "./types";
import type { GitStatusMap } from "@shared/types";

/**
 * Simplified watcher entry using new abstractions
 */
type WatcherEntry = {
  fsWatcher: IFileSystemWatcher | null;
  gitWatcher: IGitWatcher | null;
  subscribers: Set<FileWatcherSubscription>;
  gitStatus: GitStatusMap | null;
  baseBranch: string | null;
  branches: any[] | null;
  setupInProgress: boolean;
  // Git status batching
  gitStatusBatchTimer: NodeJS.Timeout | null;
  pendingGitStatusFiles: Set<string>;
};

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

  private readonly config: Required<FileWatcherConfig>;
  private watchers: Map<string, WatcherEntry> = new Map();

  /**
   * Private constructor to enforce singleton pattern.
   */
  private constructor(config: FileWatcherConfig = {}) {
    this.config = {
      disableGitWatcher: config.disableGitWatcher ?? false,
      gitStatusBatchWindowMs: config.gitStatusBatchWindowMs ?? 100,
      gitStatusBatchThreshold: config.gitStatusBatchThreshold ?? 5,
    };

    console.log("[FileWatcherService] Config:", this.config);
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
    const normalizedCwd = path.resolve(cwd);

    let entry = this.watchers.get(normalizedCwd);

    if (!entry) {
      entry = {
        fsWatcher: null,
        gitWatcher: null,
        subscribers: new Set(),
        gitStatus: null,
        baseBranch: null,
        branches: null,
        setupInProgress: false,
        gitStatusBatchTimer: null,
        pendingGitStatusFiles: new Set(),
      };
      this.watchers.set(normalizedCwd, entry);
    }

    const subscription: FileWatcherSubscription = { paneId, windowId };
    entry.subscribers.add(subscription);

    if (entry.fsWatcher === null && !entry.setupInProgress) {
      entry.setupInProgress = true;
      this.setupWatcher(normalizedCwd)
        .catch((error) => {
          console.error(
            `[FileWatcherService] Setup failed for ${normalizedCwd}:`,
            error,
          );
        })
        .finally(() => {
          const e = this.watchers.get(normalizedCwd);
          if (e) e.setupInProgress = false;
        });
    }
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

    if (!entry) return;

    entry.subscribers = new Set(
      Array.from(entry.subscribers).filter((sub) => sub.paneId !== paneId),
    );

    if (entry.subscribers.size === 0) {
      this.cleanupWatcher(normalizedCwd);
      this.watchers.delete(normalizedCwd);
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
    if (!entry) return;

    try {
      // Detect git root
      const gitRoot = await findRepoRoot(cwd);

      // Create file system watcher
      const fsWatcher = new ParcelFileSystemWatcher(cwd, {
        ignored: [
          "**/node_modules/**",
          "**/dist/**",
          "**/.git/**",
          "**/build/**",
          "**/.next/**",
          "**/.cache/**",
          "**/coverage/**",
          "**/*.log",
          "**/.DS_Store",
        ],
      });

      // Subscribe to events
      fsWatcher.onFileChanged((event) => {
        this.broadcast(cwd, "file-watcher:file-changed", event);
        if (gitRoot) this.scheduleGitStatusUpdateFile(cwd, event.filePath);
      });

      fsWatcher.onFileRenamed((event) => {
        this.broadcast(cwd, "file-watcher:file-renamed", event);
      });

      fsWatcher.onTreeChanged((event) => {
        this.broadcast(cwd, "file-watcher:tree-changed", event);
      });

      await fsWatcher.watch();
      entry.fsWatcher = fsWatcher;

      // Setup git watcher if in git repo
      if (gitRoot && !this.config.disableGitWatcher) {
        const gitWatcher = new ParcelGitWatcher(cwd, gitRoot);

        gitWatcher.onGitChanged(() => {
          entry.branches = null; // Invalidate cache
          this.scheduleGitStatusUpdateFull(cwd, 200);
        });

        await gitWatcher.watch();
        entry.gitWatcher = gitWatcher;

        // Compute initial git status
        const gitStatus = await gitWatcher.computeGitStatusFull(
          entry.baseBranch,
        );
        entry.gitStatus = gitStatus;

        // Load branches
        entry.branches = await listBranches(gitRoot);

        this.broadcastGitStatusChanged(cwd);
      }

      console.log(`[FileWatcherService] Watcher setup complete for ${cwd}`);
    } catch (error) {
      console.error(`[FileWatcherService] Failed to setup watcher:`, error);
      throw error;
    }
  }

  /**
   * Cleanup and close a file system watcher.
   *
   * @param cwd - The directory path being watched
   */
  private async cleanupWatcher(cwd: string): Promise<void> {
    const entry = this.watchers.get(cwd);
    if (!entry) return;

    if (entry.fsWatcher) {
      await entry.fsWatcher.unwatch();
      entry.fsWatcher = null;
    }

    if (entry.gitWatcher) {
      await entry.gitWatcher.unwatch();
      entry.gitWatcher = null;
    }

    if (entry.gitStatusBatchTimer) {
      clearTimeout(entry.gitStatusBatchTimer);
      entry.gitStatusBatchTimer = null;
    }

    entry.pendingGitStatusFiles.clear();
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
    if (!entry) return;

    entry.pendingGitStatusFiles.add(filePath);

    if (entry.gitStatusBatchTimer) {
      clearTimeout(entry.gitStatusBatchTimer);
    }

    entry.gitStatusBatchTimer = setTimeout(async () => {
      await this.processBatchedGitStatusUpdates(cwd);
    }, this.config.gitStatusBatchWindowMs);
  }

  /**
   * Process batched git status updates.
   * Decides whether to run full git status or per-file updates based on batch size.
   *
   * @param cwd - The directory path
   */
  private async processBatchedGitStatusUpdates(cwd: string): Promise<void> {
    const entry = this.watchers.get(cwd);
    if (!entry || !entry.gitWatcher) return;

    const pendingFiles = Array.from(entry.pendingGitStatusFiles);
    entry.pendingGitStatusFiles.clear();
    entry.gitStatusBatchTimer = null;

    if (pendingFiles.length === 0) return;

    if (pendingFiles.length > this.config.gitStatusBatchThreshold) {
      // Many files - full status
      const gitStatus = await entry.gitWatcher.computeGitStatusFull(
        entry.baseBranch,
      );
      entry.gitStatus = gitStatus;
    } else {
      // Few files - per-file status
      for (const filePath of pendingFiles) {
        const fileStatus =
          await entry.gitWatcher.computeGitStatusForFile(filePath);
        const relativePath = path.relative(cwd, filePath);

        if (entry.gitStatus) {
          if (fileStatus) {
            entry.gitStatus.set(relativePath, fileStatus);
          } else {
            entry.gitStatus.delete(relativePath);
          }
        }
      }
    }

    this.broadcastGitStatusChanged(cwd);
  }

  /**
   * Schedule a full git status update with debouncing
   *
   * @param cwd - The directory path
   * @param delay - Delay in milliseconds
   */
  private scheduleGitStatusUpdateFull(cwd: string, delay: number): void {
    setTimeout(async () => {
      const entry = this.watchers.get(cwd);
      if (!entry || !entry.gitWatcher) return;

      const gitStatus = await entry.gitWatcher.computeGitStatusFull(
        entry.baseBranch,
      );
      entry.gitStatus = gitStatus;
      this.broadcastGitStatusChanged(cwd);
    }, delay);
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
    if (!entry) return;

    const deadSubscribers: FileWatcherSubscription[] = [];

    for (const subscriber of entry.subscribers) {
      const window = BrowserWindow.fromId(subscriber.windowId);

      if (window && !window.isDestroyed()) {
        window.webContents.send(event, data);
      } else {
        deadSubscribers.push(subscriber);
      }
    }

    if (deadSubscribers.length > 0) {
      for (const deadSub of deadSubscribers) {
        entry.subscribers.delete(deadSub);
      }

      if (entry.subscribers.size === 0) {
        this.cleanupWatcher(cwd);
        this.watchers.delete(cwd);
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
    if (!entry) return;

    const gitStatusObj = entry.gitStatus
      ? Object.fromEntries(entry.gitStatus.entries())
      : null;

    const event: GitStatusChangedEvent = {
      cwd,
      gitStatus: gitStatusObj as any,
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
    if (!entry || !entry.gitWatcher) return;

    entry.baseBranch = baseBranch;
    const gitStatus = await entry.gitWatcher.computeGitStatusFull(baseBranch);
    entry.gitStatus = gitStatus;
    this.broadcastGitStatusChanged(normalizedCwd);
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
    if (!entry || !entry.gitWatcher?.getGitRoot()) return [];

    if (entry.branches !== null) return entry.branches;

    entry.branches = await listBranches(entry.gitWatcher.getGitRoot()!);
    return entry.branches;
  }

  /**
   * Manually refresh git status for a directory
   *
   * @param cwd - The directory path
   */
  public async refreshGitStatus(cwd: string): Promise<void> {
    const normalizedCwd = path.resolve(cwd);
    const entry = this.watchers.get(normalizedCwd);
    if (!entry || !entry.gitWatcher) return;

    const gitStatus = await entry.gitWatcher.computeGitStatusFull(
      entry.baseBranch,
    );
    entry.gitStatus = gitStatus;
    this.broadcastGitStatusChanged(normalizedCwd);
  }
}
