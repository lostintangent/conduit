/**
 * Git v2 Renderer API
 *
 * High-level API for git operations in the renderer process.
 * Provides CWD-scoped operations with automatic subscription management.
 *
 * This class wraps the low-level IPC methods exposed by the preload script,
 * adding:
 * - Automatic subscription tracking and cleanup
 * - Type deserialization (Map reconstruction, Date objects)
 * - Type-safe event handlers
 * - Reference lifecycle management
 *
 * Note: Git operations are repository-scoped internally. Multiple GitV2API
 * instances for different CWDs within the same repository will share the
 * same underlying provider in the main process.
 *
 * @example
 * ```typescript
 * // Create an instance for a project directory
 * const git = new GitV2API('/path/to/project');
 *
 * // Get repository status
 * const status = await git.getStatus();
 * console.log('Branch:', status?.branch);
 * console.log('Changed files:', status?.files.size);
 *
 * // Subscribe to status changes
 * const cleanup = git.onStatusChanged((status) => {
 *   console.log('Status changed:', status.files.size, 'files');
 * });
 *
 * // When done, release resources
 * git.release();
 * ```
 */

import type {
  GitStatus,
  GitFileStatus,
  GitCommit,
  GitBranch,
  GitDiffStats,
  GitCommitOptions,
  GitStatusChangedEvent,
  GitBranchChangedEvent,
  GitCommitCreatedEvent,
  GitHeadChangedEvent,
} from "../../ipc/gitv2/types";
import type { Cleanup } from "../../ipc/fsv2/types";
import type {
  SerializedGitStatus,
  SerializedGitCommit,
  SerializedGitBranch,
  StatusChangedPayload,
  BranchChangedPayload,
  CommitCreatedPayload,
  HeadChangedPayload,
} from "../../preload/window/modules/gitv2";

// ============================================================================
// Types
// ============================================================================

/**
 * Callback for status change events.
 */
export type StatusChangedCallback = (event: GitStatusChangedEvent) => void;

/**
 * Callback for branch change events.
 */
export type BranchChangedCallback = (event: GitBranchChangedEvent) => void;

/**
 * Callback for commit created events.
 */
export type CommitCreatedCallback = (event: GitCommitCreatedEvent) => void;

/**
 * Callback for HEAD change events.
 */
export type HeadChangedCallback = (event: GitHeadChangedEvent) => void;

// Re-export Cleanup from shared types for convenience
export type { Cleanup };

// ============================================================================
// Deserialization Helpers
// ============================================================================

/**
 * Convert serialized git status to full GitStatus type.
 *
 * Reconstructs the files Map from the plain object.
 */
function deserializeGitStatus(serialized: SerializedGitStatus): GitStatus {
  const files = new Map<string, GitFileStatus>();

  for (const [path, status] of Object.entries(serialized.files)) {
    files.set(path, status);
  }

  return {
    branch: serialized.branch,
    upstream: serialized.upstream,
    ahead: serialized.ahead,
    behind: serialized.behind,
    files,
  };
}

/**
 * Convert serialized git commit to full GitCommit type.
 *
 * Reconstructs the Date object from timestamp.
 */
function deserializeGitCommit(serialized: SerializedGitCommit): GitCommit {
  return {
    hash: serialized.hash,
    shortHash: serialized.shortHash,
    author: serialized.author,
    email: serialized.email,
    date: new Date(serialized.date),
    message: serialized.message,
    parents: serialized.parents,
  };
}

/**
 * Convert serialized git branch to full GitBranch type.
 */
function deserializeGitBranch(serialized: SerializedGitBranch): GitBranch {
  return {
    name: serialized.name,
    isCurrent: serialized.isCurrent,
    isRemote: serialized.isRemote,
    commit: serialized.commit,
    upstream: serialized.upstream,
    ahead: serialized.ahead,
    behind: serialized.behind,
    lastCommitDate: serialized.lastCommitDate
      ? new Date(serialized.lastCommitDate)
      : undefined,
    lastCommitMessage: serialized.lastCommitMessage,
  };
}

// ============================================================================
// GitV2API Class
// ============================================================================

/**
 * High-level git API for the renderer process.
 *
 * All operations are scoped to the CWD provided at construction.
 * Manages subscriptions automatically and cleans up on release.
 */
export class GitV2API {
  // ---------------------------------------------------------------------------
  // Static Methods
  // ---------------------------------------------------------------------------

  /**
   * Check if git is available on the system.
   *
   * This is a static method that doesn't require a GitV2API instance.
   * The result is cached on the main process side for performance.
   *
   * @returns True if git is installed and accessible
   *
   * @example
   * ```typescript
   * if (await GitV2API.isGitAvailable()) {
   *   // Git features are available
   * } else {
   *   // Show "Git not installed" message
   * }
   * ```
   */
  static async isGitAvailable(): Promise<boolean> {
    return window.conduit.gitv2.isGitAvailable();
  }

  // ---------------------------------------------------------------------------
  // Instance Properties
  // ---------------------------------------------------------------------------

  /** The working directory this API is scoped to */
  readonly cwd: string;

  /** The git root directory (resolved after first operation) */
  private gitRoot: string | null = null;

  /** Active subscription ID, if subscribed to events */
  private subscriptionId: string | null = null;

  /** Pending subscription promise (to prevent duplicate subscription requests) */
  private subscriptionPromise: Promise<void> | null = null;

  /** Pending refresh promise (to deduplicate concurrent refresh calls) */
  private refreshPromise: Promise<GitStatus | null> | null = null;

  /** Timestamp of last status update (for staleness tracking) */
  private _lastStatusUpdate = 0;

  /** Listeners registered for status changes */
  private statusListeners: Set<StatusChangedCallback> = new Set();

  /** Listeners registered for branch changes */
  private branchListeners: Set<BranchChangedCallback> = new Set();

  /** Listeners registered for commit creation */
  private commitListeners: Set<CommitCreatedCallback> = new Set();

  /** Listeners registered for HEAD changes */
  private headListeners: Set<HeadChangedCallback> = new Set();

  /** Cleanup functions for IPC event listeners */
  private ipcCleanups: Cleanup[] = [];

  /** Whether this instance has been released */
  private released = false;

  /**
   * Create a new GitV2API instance.
   *
   * Eagerly subscribes to git events to minimize the window
   * for missed events between construction and first listener registration.
   *
   * @param cwd - Working directory to scope operations to
   */
  constructor(cwd: string) {
    this.cwd = cwd;
    this.setupEventListeners();
    // Eagerly subscribe to reduce race condition window
    this.ensureSubscribed();
  }

  // ---------------------------------------------------------------------------
  // Status Operations
  // ---------------------------------------------------------------------------

  /**
   * Get complete repository status.
   *
   * @returns Git status with branch info and all changed files,
   *          or null if not a git repository
   */
  async getStatus(): Promise<GitStatus | null> {
    this.ensureNotReleased();
    const serialized = await window.conduit.gitv2.getStatus(this.cwd);

    if (!serialized) {
      return null;
    }

    // Update timestamp when status is fetched
    this._lastStatusUpdate = Date.now();

    return deserializeGitStatus(serialized);
  }

  /**
   * Force refresh the status and notify all listeners.
   *
   * Use this when you suspect the cache might be stale,
   * for example after external git operations.
   *
   * Concurrent calls are deduplicated - if a refresh is already in progress,
   * subsequent calls will return the same promise instead of triggering
   * multiple IPC calls.
   *
   * @returns The refreshed status, or null if not a git repository
   */
  async refreshStatus(): Promise<GitStatus | null> {
    this.ensureNotReleased();

    // Deduplicate concurrent refresh calls
    // If a refresh is already in progress, return the existing promise
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // Start a new refresh and track the promise
    this.refreshPromise = this.doRefreshStatus();

    try {
      return await this.refreshPromise;
    } finally {
      // Clear the promise so future calls can refresh again
      this.refreshPromise = null;
    }
  }

  /**
   * Internal implementation of status refresh.
   * Separated to allow deduplication in refreshStatus().
   */
  private async doRefreshStatus(): Promise<GitStatus | null> {
    // Force a fresh status fetch
    const status = await this.getStatus();

    if (!status) {
      return null;
    }

    // Manually fire status changed event for listeners
    const event: GitStatusChangedEvent = {
      status,
      added: [],
      modified: [],
      removed: [],
    };

    for (const callback of this.statusListeners) {
      try {
        callback(event);
      } catch (error) {
        console.error("[GitV2API] Error in status listener:", error);
      }
    }

    return status;
  }

  /**
   * Get the timestamp of the last status update.
   *
   * Returns 0 if status has never been fetched.
   */
  get lastStatusUpdate(): number {
    return this._lastStatusUpdate;
  }

  /**
   * Check if the status cache appears stale.
   *
   * @param maxAgeMs - Maximum age in milliseconds before considering stale (default: 30 seconds)
   * @returns True if status hasn't been updated within maxAgeMs
   */
  isStatusStale(maxAgeMs = 30000): boolean {
    if (this._lastStatusUpdate === 0) {
      return true; // Never updated
    }
    return Date.now() - this._lastStatusUpdate > maxAgeMs;
  }

  /**
   * Get status for a specific file.
   *
   * @param filePath - Path to file (relative to git root)
   * @returns File status, or null if file is clean
   */
  async getFileStatus(filePath: string): Promise<GitFileStatus | null> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getFileStatus(this.cwd, filePath);
  }

  /**
   * Check if repository has uncommitted changes.
   *
   * @returns true if there are uncommitted changes
   */
  async hasUncommittedChanges(): Promise<boolean> {
    this.ensureNotReleased();
    return window.conduit.gitv2.hasUncommittedChanges(this.cwd);
  }

  /**
   * Check if repository has unpushed commits.
   *
   * @returns true if there are unpushed commits
   */
  async hasUnpushedCommits(): Promise<boolean> {
    this.ensureNotReleased();
    return window.conduit.gitv2.hasUnpushedCommits(this.cwd);
  }

  // ---------------------------------------------------------------------------
  // Diff Operations
  // ---------------------------------------------------------------------------

  /**
   * Get diff for a specific file.
   *
   * @param filePath - Path to file
   * @param staged - If true, show staged changes; if false, unstaged
   * @returns Unified diff string, or null if not a git repo
   */
  async getFileDiff(
    filePath: string,
    staged?: boolean,
  ): Promise<string | null> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getFileDiff(this.cwd, filePath, staged);
  }

  /**
   * Get file content at a specific git ref.
   *
   * Useful for showing the "original" version in diff views.
   *
   * @param filePath - Path to file
   * @param ref - Git ref (commit hash, branch name, 'HEAD', etc.)
   * @returns File content, or null if not found
   */
  async getFileAtRef(filePath: string, ref: string): Promise<string | null> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getFileAtRef(this.cwd, filePath, ref);
  }

  // ---------------------------------------------------------------------------
  // Staging Operations
  // ---------------------------------------------------------------------------

  /**
   * Stage files for commit.
   *
   * @param files - Paths to stage (relative to git root)
   */
  async stage(files: string[]): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.gitv2.stage(this.cwd, files);
  }

  /**
   * Unstage files (remove from index).
   *
   * @param files - Paths to unstage (relative to git root)
   */
  async unstage(files: string[]): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.gitv2.unstage(this.cwd, files);
  }

  // ---------------------------------------------------------------------------
  // Commit Operations
  // ---------------------------------------------------------------------------

  /**
   * Create a commit.
   *
   * @param message - Commit message
   * @param options - Commit options (amend, signoff, etc.)
   * @returns The created commit, or null if not a git repo
   */
  async commit(
    message: string,
    options?: GitCommitOptions,
  ): Promise<GitCommit | null> {
    this.ensureNotReleased();
    const serialized = await window.conduit.gitv2.commit(
      this.cwd,
      message,
      options,
    );

    if (!serialized) {
      return null;
    }

    return deserializeGitCommit(serialized);
  }

  // ---------------------------------------------------------------------------
  // Branch Operations
  // ---------------------------------------------------------------------------

  /**
   * Get current branch name.
   *
   * @returns Branch name, 'HEAD' if detached, or null if not a git repo
   */
  async getCurrentBranch(): Promise<string | null> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getCurrentBranch(this.cwd);
  }

  /**
   * Get all branches (local and remote).
   *
   * @returns Array of branches
   */
  async getBranches(): Promise<GitBranch[]> {
    this.ensureNotReleased();
    const serialized = await window.conduit.gitv2.getBranches(this.cwd);
    return serialized.map(deserializeGitBranch);
  }

  /**
   * Checkout a branch or ref.
   *
   * @param ref - Branch name, tag, or commit hash
   */
  async checkout(ref: string): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.gitv2.checkout(this.cwd, ref);
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Find the git root for the current CWD.
   *
   * @returns Git root path, or null if not a git repo
   */
  async findRoot(): Promise<string | null> {
    this.ensureNotReleased();

    if (this.gitRoot) {
      return this.gitRoot;
    }

    this.gitRoot = await window.conduit.gitv2.findRoot(this.cwd);
    return this.gitRoot;
  }

  // ---------------------------------------------------------------------------
  // Comparison Operations
  // ---------------------------------------------------------------------------

  /**
   * Get files changed between current HEAD and a base branch.
   *
   * Useful for "compare to main" feature - shows all files
   * in the current branch that differ from the base.
   *
   * @param baseBranch - Branch to compare against (e.g., 'main')
   * @returns Array of relative file paths
   */
  async getChangedFilesFromBranch(baseBranch: string): Promise<string[]> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getChangedFilesFromBranch(this.cwd, baseBranch);
  }

  /**
   * Get diff statistics for uncommitted changes (lines added/removed).
   *
   * @returns Statistics about uncommitted changes
   */
  async getUncommittedDiffStats(): Promise<GitDiffStats> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getUncommittedDiffStats(this.cwd);
  }

  /**
   * Get the most recently modified dirty file.
   *
   * Useful for auto-selecting a file when opening the editor.
   *
   * @returns Relative path from git root, or null if no dirty files
   */
  async getMostRecentDirtyFile(): Promise<string | null> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getMostRecentDirtyFile(this.cwd);
  }

  /**
   * Get the most recently modified file from recent commits.
   *
   * Fallback when there are no dirty files.
   *
   * @param commitLimit - Number of recent commits to check (default: 10)
   * @returns Relative path from git root, or null if none found
   */
  async getMostRecentCommittedFile(
    commitLimit?: number,
  ): Promise<string | null> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getMostRecentCommittedFile(
      this.cwd,
      commitLimit,
    );
  }

  /**
   * Revert changes to files (discard local modifications).
   *
   * For staged files, unstages them first then reverts.
   * For unstaged files, reverts directly.
   *
   * @param files - Relative paths from git root
   */
  async revert(files: string[]): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.gitv2.revert(this.cwd, files);
  }

  // ---------------------------------------------------------------------------
  // Event Subscriptions
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to git status changes.
   *
   * @param callback - Function called when status changes
   * @returns Cleanup function to unsubscribe
   */
  onStatusChanged(callback: StatusChangedCallback): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();

    this.statusListeners.add(callback);

    return () => {
      this.statusListeners.delete(callback);
    };
  }

  /**
   * Subscribe to branch changes.
   *
   * @param callback - Function called when branch changes
   * @returns Cleanup function to unsubscribe
   */
  onBranchChanged(callback: BranchChangedCallback): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();

    this.branchListeners.add(callback);

    return () => {
      this.branchListeners.delete(callback);
    };
  }

  /**
   * Subscribe to commit creation events.
   *
   * @param callback - Function called when a commit is created
   * @returns Cleanup function to unsubscribe
   */
  onCommitCreated(callback: CommitCreatedCallback): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();

    this.commitListeners.add(callback);

    return () => {
      this.commitListeners.delete(callback);
    };
  }

  /**
   * Subscribe to HEAD changes.
   *
   * @param callback - Function called when HEAD changes
   * @returns Cleanup function to unsubscribe
   */
  onHeadChanged(callback: HeadChangedCallback): Cleanup {
    this.ensureNotReleased();
    this.ensureSubscribed();

    this.headListeners.add(callback);

    return () => {
      this.headListeners.delete(callback);
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
      window.conduit.gitv2.unsubscribe(this.subscriptionId).catch(() => {
        // Ignore errors during cleanup
      });
      this.subscriptionId = null;
    }

    // Release provider reference
    if (this.gitRoot) {
      window.conduit.gitv2.release(this.gitRoot).catch(() => {
        // Ignore errors during cleanup
      });
    }

    // Clear all listeners
    this.statusListeners.clear();
    this.branchListeners.clear();
    this.commitListeners.clear();
    this.headListeners.clear();
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
    // Status changes
    this.ipcCleanups.push(
      window.conduit.gitv2.onStatusChanged((payload: StatusChangedPayload) => {
        if (payload.subscriptionId !== this.subscriptionId) {
          return;
        }

        // Update cached git root
        this.gitRoot = payload.gitRoot;

        // Track when status was last updated
        this._lastStatusUpdate = Date.now();

        const event: GitStatusChangedEvent = {
          status: deserializeGitStatus(payload.status),
          added: payload.added,
          modified: payload.modified,
          removed: payload.removed,
        };

        for (const callback of this.statusListeners) {
          try {
            callback(event);
          } catch (error) {
            console.error("[GitV2API] Error in status listener:", error);
          }
        }
      }),
    );

    // Branch changes
    this.ipcCleanups.push(
      window.conduit.gitv2.onBranchChanged((payload: BranchChangedPayload) => {
        if (payload.subscriptionId !== this.subscriptionId) {
          return;
        }

        const event: GitBranchChangedEvent = {
          previousBranch: payload.previousBranch,
          currentBranch: payload.currentBranch,
        };

        for (const callback of this.branchListeners) {
          try {
            callback(event);
          } catch (error) {
            console.error("[GitV2API] Error in branch listener:", error);
          }
        }
      }),
    );

    // Commit creation
    this.ipcCleanups.push(
      window.conduit.gitv2.onCommitCreated((payload: CommitCreatedPayload) => {
        if (payload.subscriptionId !== this.subscriptionId) {
          return;
        }

        const event: GitCommitCreatedEvent = {
          commit: deserializeGitCommit(payload.commit),
        };

        for (const callback of this.commitListeners) {
          try {
            callback(event);
          } catch (error) {
            console.error("[GitV2API] Error in commit listener:", error);
          }
        }
      }),
    );

    // HEAD changes
    this.ipcCleanups.push(
      window.conduit.gitv2.onHeadChanged((payload: HeadChangedPayload) => {
        if (payload.subscriptionId !== this.subscriptionId) {
          return;
        }

        const event: GitHeadChangedEvent = {
          previousHead: payload.previousHead,
          currentHead: payload.currentHead,
          isBranchSwitch: payload.isBranchSwitch,
        };

        for (const callback of this.headListeners) {
          try {
            callback(event);
          } catch (error) {
            console.error("[GitV2API] Error in head listener:", error);
          }
        }
      }),
    );
  }

  /**
   * Ensure we have an active subscription to the main process.
   *
   * Uses a promise to prevent multiple concurrent subscription requests.
   * If a subscription is already in progress, returns immediately.
   */
  private ensureSubscribed(): void {
    // Already subscribed
    if (this.subscriptionId) {
      return;
    }

    // Subscription already in progress - don't start another
    if (this.subscriptionPromise) {
      return;
    }

    // Start subscription
    this.subscriptionPromise = (async () => {
      try {
        const subscriptionId = await window.conduit.gitv2.subscribe(this.cwd);

        if (!subscriptionId) {
          // Not a git repository - subscriptions won't work
          return;
        }

        this.subscriptionId = subscriptionId;

        // Also resolve the git root while we're at it
        this.gitRoot = await window.conduit.gitv2.findRoot(this.cwd);
      } catch (error) {
        console.error("[GitV2API] Failed to subscribe:", error);
      } finally {
        this.subscriptionPromise = null;
      }
    })();
  }

  /**
   * Throw if this instance has been released.
   */
  private ensureNotReleased(): void {
    if (this.released) {
      throw new Error("GitV2API has been released and cannot be used");
    }
  }
}
