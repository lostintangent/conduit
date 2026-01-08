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

import type { Cleanup } from "../../ipc/fsv2/types";
import type {
  CommitFile,
  CommitHistoryResult,
  FileWithTime,
  GetCommitHistoryOptions,
  GitBranch,
  GitBranchChangedEvent,
  GitCommit,
  GitCommitCreatedEvent,
  GitCommitOptions,
  GitDiffStats,
  GitFileStatus,
  GitHeadChangedEvent,
  GitStatus,
  GitStatusChangedEvent,
  HistoryCommit,
  PerFileDiffStats,
  SplitPerFileDiffStats,
  TrackedBranchInfo,
} from "../../ipc/gitv2/types";
import type {
  BranchChangedPayload,
  CommitCreatedPayload,
  GetCommitHistoryOptions as PreloadGetCommitHistoryOptions,
  HeadChangedPayload,
  SerializedCommitFile,
  SerializedCommitHistoryResult,
  SerializedGitBranch,
  SerializedGitCommit,
  SerializedGitStatus,
  SerializedHistoryCommit,
  SerializedSplitPerFileDiffStats,
  StatusChangedPayload,
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

/**
 * Convert serialized history commit to full HistoryCommit type.
 *
 * HistoryCommit uses primitive types (timestamp is already number),
 * so this is mostly a type cast.
 */
function deserializeHistoryCommit(
  serialized: SerializedHistoryCommit,
): HistoryCommit {
  return {
    id: serialized.id,
    shortId: serialized.shortId,
    subject: serialized.subject,
    message: serialized.message,
    author: serialized.author,
    authorEmail: serialized.authorEmail,
    timestamp: serialized.timestamp,
    parentIds: serialized.parentIds,
    refs: serialized.refs,
  };
}

/**
 * Convert serialized commit file to full CommitFile type.
 */
function deserializeCommitFile(serialized: SerializedCommitFile): CommitFile {
  return {
    path: serialized.path,
    status: serialized.status as CommitFile["status"],
    originalPath: serialized.originalPath,
    additions: serialized.additions,
    deletions: serialized.deletions,
    isBinary: serialized.isBinary,
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

  /** Optional sandbox ID for cloud VM operations */
  readonly sandboxId?: string;

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
   * @param sandboxId - Optional sandbox ID for cloud VM git operations
   */
  constructor(cwd: string, sandboxId?: string) {
    this.cwd = cwd;
    this.sandboxId = sandboxId;
    this.setupEventListeners();
    // Eagerly subscribe to reduce race condition window
    this.ensureSubscribed();
  }

  /**
   * Wait for the API to be ready (subscription established).
   *
   * Use this before calling operations that require an active subscription.
   * Returns immediately if already subscribed or if not a git repository.
   *
   * @example
   * ```typescript
   * const git = new GitV2API('/path/to/project');
   * await git.whenReady();
   * // Now safe to call operations that require subscription
   * const dirtyFile = await git.getMostRecentDirtyFile();
   * ```
   */
  async whenReady(): Promise<void> {
    // If already subscribed, nothing to wait for
    if (this.subscriptionId) {
      return;
    }

    // If subscription is in progress, wait for it
    if (this.subscriptionPromise) {
      await this.subscriptionPromise;
    }
  }

  // ---------------------------------------------------------------------------
  // Status Operations
  // ---------------------------------------------------------------------------

  /**
   * Get complete repository status.
   *
   * @returns Git status with branch info and all changed files,
   *          or null if not a git repository
   * @throws {Error} If the API has been released
   */
  async getStatus(): Promise<GitStatus | null> {
    this.ensureNotReleased();
    const serialized = await window.conduit.gitv2.getStatus(
      this.cwd,
      this.sandboxId,
    );

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
   * @throws {Error} If the API has been released
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
   * @throws {Error} If the API has been released
   */
  async getFileStatus(filePath: string): Promise<GitFileStatus | null> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getFileStatus(
      this.cwd,
      filePath,
      this.sandboxId,
    );
  }

  /**
   * Check if repository has uncommitted changes.
   *
   * @returns true if there are uncommitted changes
   * @throws {Error} If the API has been released
   */
  async hasUncommittedChanges(): Promise<boolean> {
    this.ensureNotReleased();
    return window.conduit.gitv2.hasUncommittedChanges(this.cwd, this.sandboxId);
  }

  /**
   * Check if repository has unpushed commits.
   *
   * @returns true if there are unpushed commits
   * @throws {Error} If the API has been released
   */
  async hasUnpushedCommits(): Promise<boolean> {
    this.ensureNotReleased();
    return window.conduit.gitv2.hasUnpushedCommits(this.cwd, this.sandboxId);
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
   * @throws {Error} If the API has been released
   */
  async getFileDiff(
    filePath: string,
    staged?: boolean,
  ): Promise<string | null> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getFileDiff(
      this.cwd,
      filePath,
      staged,
      this.sandboxId,
    );
  }

  /**
   * Get file content at a specific git ref.
   *
   * Useful for showing the "original" version in diff views.
   *
   * @param filePath - Path to file
   * @param ref - Git ref (commit hash, branch name, 'HEAD', etc.)
   * @returns File content, or null if not found
   * @throws {Error} If the API has been released
   */
  async getFileAtRef(filePath: string, ref: string): Promise<string | null> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getFileAtRef(
      this.cwd,
      filePath,
      ref,
      this.sandboxId,
    );
  }

  // ---------------------------------------------------------------------------
  // Staging Operations
  // ---------------------------------------------------------------------------

  /**
   * Stage files for commit.
   *
   * @param files - Paths to stage (relative to git root)
   * @throws {Error} If the API has been released
   * @throws {Error} If staging fails (file not found, etc.)
   */
  async stage(files: string[]): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.gitv2.stage(this.cwd, files, this.sandboxId);
  }

  /**
   * Unstage files (remove from index).
   *
   * @param files - Paths to unstage (relative to git root)
   * @throws {Error} If the API has been released
   * @throws {Error} If unstaging fails
   */
  async unstage(files: string[]): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.gitv2.unstage(this.cwd, files, this.sandboxId);
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
   * @throws {Error} If the API has been released
   * @throws {Error} If commit fails (no staged changes, etc.)
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
      this.sandboxId,
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
   * @throws {Error} If the API has been released
   */
  async getCurrentBranch(): Promise<string | null> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getCurrentBranch(this.cwd, this.sandboxId);
  }

  /**
   * Get all branches (local and remote).
   *
   * @returns Array of branches
   * @throws {Error} If the API has been released
   */
  async getBranches(): Promise<GitBranch[]> {
    this.ensureNotReleased();
    const serialized = await window.conduit.gitv2.getBranches(
      this.cwd,
      this.sandboxId,
    );
    return serialized.map(deserializeGitBranch);
  }

  /**
   * Checkout a branch or ref.
   *
   * @param ref - Branch name, tag, or commit hash
   * @param force - If true, force checkout (discards local changes)
   * @throws {Error} If the API has been released
   * @throws {Error} If checkout fails (uncommitted changes, invalid ref, etc.)
   */
  async checkout(ref: string, force = false): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.gitv2.checkout(this.cwd, ref, force, this.sandboxId);
  }

  /**
   * Create a new branch and optionally switch to it.
   *
   * @param branchName - Name for the new branch
   * @param checkout - Whether to switch to the new branch (default: true)
   * @param startPoint - Optional ref to start the branch from (default: HEAD)
   * @throws {Error} If the API has been released
   * @throws {Error} If branch creation fails (name exists, invalid name, etc.)
   */
  async createBranch(
    branchName: string,
    checkout = true,
    startPoint?: string,
  ): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.gitv2.createBranch(
      this.cwd,
      branchName,
      checkout,
      startPoint,
    );
  }

  /**
   * Stash current uncommitted changes.
   *
   * Saves both staged and unstaged changes to the stash.
   *
   * @param message - Optional message for the stash entry
   * @throws {Error} If the API has been released
   */
  async stash(message?: string): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.gitv2.stash(this.cwd, message, this.sandboxId);
  }

  /**
   * Apply and remove the most recent stash entry.
   *
   * Restores the previously stashed changes to the working directory.
   *
   * @throws {Error} If the API has been released
   * @throws {Error} If there are no stash entries or applying fails
   */
  async stashPop(): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.gitv2.stashPop(this.cwd, this.sandboxId);
  }

  // ---------------------------------------------------------------------------
  // Remote Operations
  // ---------------------------------------------------------------------------

  /**
   * Push commits to remote.
   *
   * When setUpstream is true, this will create/track the remote branch,
   * useful for pushing new branches that don't exist on the remote yet.
   *
   * @param force - If true, use --force-with-lease for safer force push
   * @param setUpstream - If true, set upstream tracking (for new branches)
   * @throws {Error} If the API has been released
   * @throws {Error} If push fails (no remote, auth issues, etc.)
   */
  async push(force = false, setUpstream = false): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.gitv2.push(
      this.cwd,
      force,
      setUpstream,
      this.sandboxId,
    );
  }

  /**
   * Pull changes from remote.
   *
   * @param rebase - If true, use rebase instead of merge
   * @throws {Error} If the API has been released
   * @throws {Error} If pull fails (merge conflicts, no upstream, etc.)
   */
  async pull(rebase = false): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.gitv2.pull(this.cwd, rebase, this.sandboxId);
  }

  /**
   * Check if the current branch has an upstream (tracking) branch.
   *
   * Use this to determine whether to show "Push" or "Publish" UI.
   *
   * @returns true if an upstream is configured, false otherwise
   * @throws {Error} If the API has been released
   */
  async hasUpstream(): Promise<boolean> {
    this.ensureNotReleased();
    return window.conduit.gitv2.hasUpstream(this.cwd, this.sandboxId);
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Find the git root for the current CWD.
   *
   * @returns Git root path, or null if not a git repo
   * @throws {Error} If the API has been released
   */
  async findRoot(): Promise<string | null> {
    this.ensureNotReleased();

    if (this.gitRoot) {
      return this.gitRoot;
    }

    this.gitRoot = await window.conduit.gitv2.findRoot(
      this.cwd,
      this.sandboxId,
    );
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
   * @throws {Error} If the API has been released
   */
  async getChangedFilesFromBranch(baseBranch: string): Promise<string[]> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getChangedFilesFromBranch(
      this.cwd,
      baseBranch,
      this.sandboxId,
    );
  }

  /**
   * Get git status relative to a base branch.
   *
   * Returns files with proper status (added, modified, deleted, renamed).
   * Also overlays working tree changes (uncommitted modifications).
   *
   * @param baseBranch - Branch to compare against (e.g., 'main')
   * @returns Map of relative file paths to their GitFileStatus
   * @throws {Error} If the API has been released
   */
  async getStatusFromBranch(
    baseBranch: string,
  ): Promise<Map<string, GitFileStatus>> {
    this.ensureNotReleased();
    const result = await window.conduit.gitv2.getStatusFromBranch(
      this.cwd,
      baseBranch,
      this.sandboxId,
    );
    // Convert plain object back to Map
    return new Map(Object.entries(result));
  }

  /**
   * Get diff statistics for uncommitted changes (lines added/removed).
   *
   * @returns Statistics about uncommitted changes
   * @throws {Error} If the API has been released
   */
  async getUncommittedDiffStats(): Promise<GitDiffStats> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getUncommittedDiffStats(
      this.cwd,
      this.sandboxId,
    );
  }

  /**
   * Get per-file diff statistics for uncommitted changes.
   *
   * Returns lines added/removed for each changed file, split by staged/unstaged.
   * Useful for displaying diff stats next to file names in the UI.
   *
   * @returns Split stats for staged and unstaged changes
   * @throws {Error} If the API has been released
   */
  async getPerFileDiffStats(): Promise<SplitPerFileDiffStats> {
    this.ensureNotReleased();
    const serialized: SerializedSplitPerFileDiffStats =
      await window.conduit.gitv2.getPerFileDiffStats(this.cwd, this.sandboxId);

    // Convert plain objects back to Maps
    const deserializeMap = (
      obj: Record<string, { added: number; removed: number }>,
    ): PerFileDiffStats => {
      const map: PerFileDiffStats = new Map();
      for (const [path, stats] of Object.entries(obj)) {
        map.set(path, stats);
      }
      return map;
    };

    return {
      staged: deserializeMap(serialized.staged),
      unstaged: deserializeMap(serialized.unstaged),
    };
  }

  /**
   * Get the most recently modified dirty file.
   *
   * Useful for auto-selecting a file when opening the editor.
   *
   * @returns Relative path from git root, or null if no dirty files
   * @throws {Error} If the API has been released
   */
  async getMostRecentDirtyFile(): Promise<string | null> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getMostRecentDirtyFile(
      this.cwd,
      this.sandboxId,
    );
  }

  /**
   * Get the most recently modified file from recent commits.
   *
   * Fallback when there are no dirty files.
   *
   * @param commitLimit - Number of recent commits to check (default: 10)
   * @returns Relative path from git root, or null if none found
   * @throws {Error} If the API has been released
   */
  async getMostRecentCommittedFile(
    commitLimit?: number,
  ): Promise<string | null> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getMostRecentCommittedFile(
      this.cwd,
      commitLimit,
      this.sandboxId,
    );
  }

  /**
   * Get all dirty files with their modification timestamps.
   *
   * Useful for sorting files by modification time in Follow mode.
   *
   * @returns Array of files with their modification times, sorted most recent first
   * @throws {Error} If the API has been released
   */
  async getDirtyFilesWithTimes(): Promise<FileWithTime[]> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getDirtyFilesWithTimes(
      this.cwd,
      this.sandboxId,
    );
  }

  /**
   * Revert changes to files (discard local modifications).
   *
   * For staged files, unstages them first then reverts.
   * For unstaged files, reverts directly.
   *
   * @param files - Relative paths from git root
   * @throws {Error} If the API has been released
   * @throws {Error} If revert fails (file not found, etc.)
   */
  async revert(files: string[]): Promise<void> {
    this.ensureNotReleased();
    return window.conduit.gitv2.revert(this.cwd, files, this.sandboxId);
  }

  // ---------------------------------------------------------------------------
  // Commit History Operations
  // ---------------------------------------------------------------------------

  /**
   * Get commit history with pagination support.
   *
   * Returns commits in topological order (newest first), which is required
   * for correct swimlane graph computation.
   *
   * @param options - Pagination and filtering options
   * @returns Paginated commit history result
   * @throws {Error} If the API has been released
   *
   * @example
   * ```typescript
   * // Get first 50 commits
   * const result = await git.getCommitHistory({ limit: 50 });
   *
   * // Load more commits
   * if (result.hasMore) {
   *   const more = await git.getCommitHistory({ limit: 50, skip: 50 });
   * }
   * ```
   */
  async getCommitHistory(
    options?: GetCommitHistoryOptions,
  ): Promise<CommitHistoryResult> {
    this.ensureNotReleased();
    const result = await window.conduit.gitv2.getCommitHistory(
      this.cwd,
      options,
    );
    return {
      commits: result.commits.map(deserializeHistoryCommit),
      hasMore: result.hasMore,
      totalCount: result.totalCount,
    };
  }

  /**
   * Get a single commit by its hash.
   *
   * @param commitId - Full or short commit hash
   * @returns The commit, or null if not found
   * @throws {Error} If the API has been released
   */
  async getCommit(commitId: string): Promise<HistoryCommit | null> {
    this.ensureNotReleased();
    const result = await window.conduit.gitv2.getCommit(this.cwd, commitId);
    return result ? deserializeHistoryCommit(result) : null;
  }

  /**
   * Get files changed in a specific commit.
   *
   * Returns the list of files modified by the commit with their
   * status (added/modified/deleted/renamed) and diff statistics.
   *
   * @param commitId - Full or short commit hash
   * @returns Array of files changed in the commit
   * @throws {Error} If the API has been released
   */
  async getCommitFiles(commitId: string): Promise<CommitFile[]> {
    this.ensureNotReleased();
    const result = await window.conduit.gitv2.getCommitFiles(
      this.cwd,
      commitId,
    );
    return result.map(deserializeCommitFile);
  }

  /**
   * Get file content at a specific commit.
   *
   * Retrieves the content of a file as it existed at a particular commit.
   * Used for displaying historical diffs.
   *
   * @param commitId - Full or short commit hash
   * @param filePath - Relative path from git root
   * @returns File content, or null if file doesn't exist at that commit
   * @throws {Error} If the API has been released
   */
  async getFileAtCommit(
    commitId: string,
    filePath: string,
  ): Promise<string | null> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getFileAtCommit(this.cwd, commitId, filePath);
  }

  /**
   * Get tracked branch information for the current branch.
   *
   * Returns the current branch, its upstream (tracking) branch, and base branch
   * along with their commit IDs. Used for VS Code-style branch coloring in the
   * commit graph where:
   * - Current branch commits are blue
   * - Upstream branch commits are purple
   * - Base branch commits are orange
   *
   * @returns Tracked branch info with current, upstream, and base branches
   * @throws {Error} If the API has been released
   */
  async getTrackedBranches(): Promise<TrackedBranchInfo> {
    this.ensureNotReleased();
    return window.conduit.gitv2.getTrackedBranches(this.cwd);
  }

  // ---------------------------------------------------------------------------
  // Event Subscriptions
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to git status changes.
   *
   * @param callback - Function called when status changes
   * @returns Cleanup function to unsubscribe
   * @throws {Error} If the API has been released
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
   * @throws {Error} If the API has been released
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
   * @throws {Error} If the API has been released
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
   * @throws {Error} If the API has been released
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

    // Unsubscribe from main process (this also releases the provider reference)
    if (this.subscriptionId) {
      window.conduit.gitv2.unsubscribe(this.subscriptionId).catch(() => {
        // Ignore errors during cleanup
      });
      this.subscriptionId = null;
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
   *
   * Handles the race condition where release() is called while the
   * subscription IPC is in flight - in that case, immediately unsubscribes.
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
        const subscriptionId = await window.conduit.gitv2.subscribe(
          this.cwd,
          this.sandboxId,
        );

        if (!subscriptionId) {
          // Not a git repository - subscriptions won't work
          return;
        }

        // Check if we were released while waiting for the subscription
        // This handles the race condition where release() is called
        // before the IPC completes
        if (this.released) {
          // Immediately unsubscribe since we're already released
          window.conduit.gitv2.unsubscribe(subscriptionId).catch(() => {
            // Ignore errors during cleanup
          });
          return;
        }

        this.subscriptionId = subscriptionId;

        // Also resolve the git root while we're at it
        this.gitRoot = await window.conduit.gitv2.findRoot(
          this.cwd,
          this.sandboxId,
        );
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
