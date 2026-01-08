/**
 * Git Provider v2 - Core Type Definitions
 *
 * This module defines the foundational types for the Git abstraction layer.
 * Unlike FileSystemProvider (CWD-scoped), GitProvider is repository-scoped -
 * multiple CWDs within the same repository share one provider instance.
 *
 * Design Philosophy:
 * - Repository-scoped: One provider per git root, not per CWD
 * - Semantic events: Events describe what changed, not how we detected it
 * - Efficient payloads: Include both full state and delta for flexibility
 *
 * @see docs/architecture/filesystem-provider-design-narrative.md
 */

import type { Event } from "../fsv2/types";

// ============================================================================
// Git File Status Types
// ============================================================================

/**
 * Possible states for a file in a git repository.
 *
 * These map to git's porcelain status output but with clearer names.
 */
export type GitFileStatusCode =
  | "added" // New file, staged
  | "modified" // Modified from HEAD
  | "deleted" // Deleted from working tree
  | "renamed" // Renamed (detected by git)
  | "copied" // Copied (rare, requires --find-copies)
  | "untracked" // Not tracked by git
  | "ignored" // In .gitignore
  | "unmerged"; // Merge conflict

/**
 * Status information for a single file.
 */
export interface GitFileStatus {
  /** Relative path from git root */
  path: string;

  /** Current status of the file */
  status: GitFileStatusCode;

  /** Whether the file is staged for commit */
  staged: boolean;

  /** Original path if file was renamed (undefined otherwise) */
  originalPath?: string;

  /**
   * Whether the file has changes in the git index (staging area).
   *
   * This is particularly useful for unstaged entries of partially staged files.
   * When true on an unstaged entry, it indicates that the diff should be
   * shown as Index → Working Directory, not HEAD → Working Directory.
   *
   * For staged entries, this is always true (implied by staged: true).
   */
  hasIndexChanges?: boolean;
}

/**
 * Complete repository status.
 *
 * Provides a snapshot of the git state including branch info
 * and all changed files.
 */
export interface GitStatus {
  /** Current branch name (or 'HEAD' if detached) */
  branch: string;

  /** Upstream tracking branch (e.g., 'origin/main') */
  upstream?: string;

  /** Number of commits ahead of upstream */
  ahead: number;

  /** Number of commits behind upstream */
  behind: number;

  /**
   * Map of file paths to their status.
   *
   * Key is relative path from git root.
   * Only includes files with changes (not unchanged files).
   */
  files: Map<string, GitFileStatus>;
}

// ============================================================================
// Git Commit Types
// ============================================================================

/**
 * Information about a git commit.
 */
export interface GitCommit {
  /** Full 40-character SHA hash */
  hash: string;

  /** Short hash (first 7 characters) for display */
  shortHash: string;

  /** Author name */
  author: string;

  /** Author email */
  email: string;

  /** Commit date */
  date: Date;

  /** Commit message (first line only for summary) */
  message: string;

  /** Parent commit hashes (usually 1, 2+ for merges) */
  parents: string[];
}

// ============================================================================
// Commit History Types
// ============================================================================

/**
 * Extended commit information for history display.
 *
 * This extends GitCommit with additional fields needed for
 * commit graph visualization and history browsing.
 */
export interface HistoryCommit {
  /** Full 40-character SHA hash */
  id: string;

  /** Short hash (first 7 characters) for display */
  shortId: string;

  /** Commit subject (first line of message) */
  subject: string;

  /** Full commit message including body */
  message: string;

  /** Author name */
  author: string;

  /** Author email */
  authorEmail: string;

  /** Commit timestamp (milliseconds since epoch) */
  timestamp: number;

  /** Parent commit hashes (empty for root commits, 2+ for merges) */
  parentIds: string[];

  /** Refs pointing to this commit (branch names, tags) */
  refs?: string[];
}

/**
 * File changed in a commit.
 *
 * Represents a single file modification within a commit,
 * including its status (added/modified/deleted/renamed).
 */
export interface CommitFile {
  /** Relative path from git root */
  path: string;

  /** Change status */
  status: GitFileStatusCode;

  /** Original path if renamed (undefined otherwise) */
  originalPath?: string;

  /** Lines added (0 for binary/deleted files) */
  additions: number;

  /** Lines removed (0 for binary/added files) */
  deletions: number;

  /** True if file is binary */
  isBinary: boolean;
}

/**
 * Options for fetching commit history.
 */
export interface GetCommitHistoryOptions {
  /**
   * Maximum number of commits to return.
   * @default 50
   */
  limit?: number;

  /**
   * Number of commits to skip (for pagination).
   * @default 0
   */
  skip?: number;

  /**
   * Branch or ref to get history for.
   * Defaults to current HEAD.
   */
  ref?: string;
}

/**
 * Result of fetching commit history.
 */
export interface CommitHistoryResult {
  /** The commits (newest first) */
  commits: HistoryCommit[];

  /** Whether there are more commits available */
  hasMore: boolean;

  /** Total count of commits (if available) */
  totalCount?: number;
}

/**
 * Options for creating a commit.
 */
export interface GitCommitOptions {
  /** Specific files to commit (default: all staged) */
  files?: string[];

  /** Amend the previous commit instead of creating new */
  amend?: boolean;

  /** Add Signed-off-by trailer */
  signoff?: boolean;
}

/**
 * Options for checking out a branch or ref.
 */
export interface GitCheckoutOptions {
  /**
   * Force checkout, discarding local changes.
   * Use with caution - will discard uncommitted modifications.
   */
  force?: boolean;
}

// ============================================================================
// Git Branch Types
// ============================================================================

/**
 * Information about a git branch.
 */
export interface GitBranch {
  /** Branch name (e.g., 'main', 'feature/foo') */
  name: string;

  /** Whether this is a remote-tracking branch */
  isRemote: boolean;

  /** Whether this is the currently checked-out branch */
  isCurrent: boolean;

  /** Commit hash the branch points to */
  commit: string;

  /** Upstream tracking branch (e.g., 'origin/main') */
  upstream?: string;

  /** Commits ahead of upstream (if tracking) */
  ahead?: number;

  /** Commits behind upstream (if tracking) */
  behind?: number;

  /** Date of the last commit on this branch */
  lastCommitDate?: Date;

  /** Message of the last commit on this branch */
  lastCommitMessage?: string;
}

/**
 * Statistics about uncommitted changes.
 */
export interface GitDiffStats {
  /** Total lines added */
  added: number;

  /** Total lines removed */
  removed: number;

  /** Number of files with changes */
  files: number;
}

/**
 * Per-file diff statistics (lines added/removed).
 */
export interface FileDiffStat {
  /** Lines added in this file */
  added: number;

  /** Lines removed from this file */
  removed: number;
}

/**
 * Map of file paths to their diff statistics.
 * Key is the relative path from git root.
 */
export type PerFileDiffStats = Map<string, FileDiffStat>;

/**
 * Split diff statistics for staged and unstaged changes.
 */
export interface SplitPerFileDiffStats {
  /** Stats for staged changes (index vs HEAD) */
  staged: PerFileDiffStats;
  /** Stats for unstaged changes (working tree vs index) */
  unstaged: PerFileDiffStats;
}

/**
 * File with its modification timestamp.
 */
export interface FileWithTime {
  /** Relative path from git root */
  path: string;
  /** Modification time in milliseconds since epoch */
  mtime: number;
}

// ============================================================================
// Tracked Branch Types (for VS Code-style graph coloring)
// ============================================================================

/**
 * Type of tracked branch for color-coding in the commit graph.
 *
 * VS Code-style coloring:
 * - current: Blue - commits ahead of upstream (local only)
 * - upstream: Purple - commits on upstream but ahead of base
 * - base: Orange - commits on the base branch (e.g., origin/main)
 */
export type TrackedBranchType = "current" | "upstream" | "base";

/**
 * Information about a single tracked branch.
 */
export interface TrackedBranch {
  /** Branch name (e.g., "main", "feature/foo") */
  name: string;

  /** Display name for badges (e.g., "main", "origin/main") */
  displayName: string;

  /** Type of tracked branch */
  type: TrackedBranchType;

  /** Commit ID this branch points to */
  commitId: string;

  /** Remote name (for upstream/base branches) */
  remote?: string;
}

/**
 * Complete tracked branch information for the current HEAD.
 *
 * Used to determine:
 * 1. Ref badges to display (with distinct colors)
 * 2. Swimlane color segments in the commit graph
 *
 * @example
 * ```typescript
 * const tracked = await git.getTrackedBranches();
 * // {
 * //   current: { name: "feature/foo", commitId: "abc123", type: "current" },
 * //   upstream: { name: "origin/feature/foo", commitId: "def456", type: "upstream" },
 * //   base: { name: "origin/main", commitId: "ghi789", type: "base" }
 * // }
 * ```
 */
export interface TrackedBranchInfo {
  /** Current branch (where HEAD points) - Blue color */
  current: TrackedBranch | null;

  /** Upstream tracking branch - Purple color */
  upstream: TrackedBranch | null;

  /** Base branch (where feature was created from) - Orange color */
  base: TrackedBranch | null;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event fired when git status changes.
 *
 * Includes both the full status (for complete refresh) and delta
 * information (for incremental updates). Consumers can choose
 * which is more appropriate for their use case.
 */
export interface GitStatusChangedEvent {
  /** Complete current status */
  status: GitStatus;

  /** Files added since last status (new changes) */
  added: string[];

  /** Files whose status changed since last status */
  modified: string[];

  /** Files no longer in changed state (reverted or committed) */
  removed: string[];
}

/**
 * Event fired when the current branch changes.
 *
 * Triggered by checkout, branch creation while checked out, etc.
 */
export interface GitBranchChangedEvent {
  /** Previous branch name */
  previousBranch: string;

  /** New current branch name */
  currentBranch: string;
}

/**
 * Event fired when a commit is created.
 */
export interface GitCommitCreatedEvent {
  /** The newly created commit */
  commit: GitCommit;
}

/**
 * Event fired when HEAD changes.
 *
 * More general than branch change - includes reset, rebase, etc.
 */
export interface GitHeadChangedEvent {
  /** Previous HEAD commit hash */
  previousHead: string;

  /** New HEAD commit hash */
  currentHead: string;

  /** Whether this was a branch switch (vs reset/rebase) */
  isBranchSwitch: boolean;
}

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * The core Git provider interface.
 *
 * Provides unified git operations with integrated status watching.
 * Scoped to a git repository (not CWD) - the service finds the
 * repository root automatically.
 *
 * Key Design Points:
 * 1. Repository-scoped: Multiple CWDs in same repo share one provider
 * 2. Debounced status: 100ms debounce prevents thrashing during operations
 * 3. Smart .git/ watching: Ignores noisy paths like objects/
 * 4. Operation tracking: Doesn't refresh during active git operations
 *
 * @example
 * ```typescript
 * const provider = await gitService.getProvider('/project/src');
 * // Returns provider for /project (the git root)
 *
 * const status = await provider.getStatus();
 * console.log('Branch:', status.branch);
 * console.log('Changed files:', status.files.size);
 *
 * provider.onStatusChanged((event) => {
 *   console.log('Status changed, added:', event.added.length);
 * });
 * ```
 */
export interface GitProvider {
  /** The git repository root directory */
  readonly gitRoot: string;

  /** The CWD used to create this provider (for relative path resolution) */
  readonly cwd: string;

  // -------------------------------------------------------------------------
  // State Queries
  // -------------------------------------------------------------------------

  /**
   * Get complete repository status.
   *
   * Returns branch info and all changed files.
   */
  getStatus(): Promise<GitStatus>;

  /**
   * Get status for a specific file.
   *
   * @param filePath - Relative path from git root
   * @returns null if file has no changes (is clean)
   */
  getFileStatus(filePath: string): Promise<GitFileStatus | null>;

  /**
   * Get current branch name.
   *
   * @returns 'HEAD' if in detached HEAD state
   */
  getCurrentBranch(): Promise<string>;

  /**
   * Get all branches (local and remote).
   */
  getBranches(): Promise<GitBranch[]>;

  /**
   * Get diff for a specific file.
   *
   * @param filePath - Relative path from git root
   * @param staged - If true, show staged changes; if false, unstaged changes
   * @returns Unified diff string
   */
  getFileDiff(filePath: string, staged?: boolean): Promise<string>;

  /**
   * Get file content at a specific ref (commit, branch, tag).
   *
   * Useful for showing the "original" version in diff views.
   *
   * @param filePath - Relative path from git root
   * @param ref - Git ref (e.g., 'HEAD', 'main', commit hash)
   * @throws If file doesn't exist at that ref
   */
  getFileAtRef(filePath: string, ref: string): Promise<string>;

  /**
   * Check if there are uncommitted changes.
   */
  hasUncommittedChanges(): Promise<boolean>;

  /**
   * Check if there are commits not pushed to upstream.
   */
  hasUnpushedCommits(): Promise<boolean>;

  /**
   * Get files changed between current HEAD and a base branch.
   *
   * Useful for "compare to main" feature - shows all files
   * in the current branch that differ from the base.
   *
   * @param baseBranch - Branch to compare against (e.g., 'main')
   * @returns Array of relative file paths
   */
  getChangedFilesFromBranch(baseBranch: string): Promise<string[]>;

  /**
   * Get git status relative to a base branch.
   *
   * Returns files that have been added, modified, or deleted
   * in the current branch compared to the base branch, WITH their proper
   * status (added, modified, deleted, renamed).
   *
   * Also overlays working tree changes (uncommitted modifications).
   *
   * @param baseBranch - Branch to compare against (e.g., 'main')
   * @returns Map of relative file paths to their GitFileStatus
   */
  getStatusFromBranch(baseBranch: string): Promise<Map<string, GitFileStatus>>;

  /**
   * Get diff statistics for uncommitted changes (lines added/removed).
   *
   * @returns Statistics about uncommitted changes
   */
  getUncommittedDiffStats(): Promise<GitDiffStats>;

  /**
   * Get per-file diff statistics for uncommitted changes.
   *
   * Returns lines added/removed for each changed file, split by staged/unstaged.
   * Useful for displaying diff stats next to file names in the UI.
   *
   * @returns Staged and unstaged stats separately
   */
  getPerFileDiffStats(): Promise<SplitPerFileDiffStats>;

  /**
   * Get the most recently modified dirty file.
   *
   * Useful for auto-selecting a file when opening the editor.
   *
   * @returns Relative path from git root, or null if no dirty files
   */
  getMostRecentDirtyFile(): Promise<string | null>;

  /**
   * Get all dirty files with their modification timestamps.
   *
   * Useful for sorting files by modification time in Follow mode.
   *
   * @returns Array of files with their modification times, sorted most recent first
   */
  getDirtyFilesWithTimes(): Promise<FileWithTime[]>;

  /**
   * Get the most recently modified file from recent commits.
   *
   * Fallback when there are no dirty files.
   *
   * @param commitLimit - Number of recent commits to check (default: 10)
   * @returns Relative path from git root, or null if none found
   */
  getMostRecentCommittedFile(commitLimit?: number): Promise<string | null>;

  /**
   * Revert changes to files (discard local modifications).
   *
   * For staged files, unstages them first then reverts.
   * For unstaged files, reverts directly.
   *
   * @param files - Relative paths from git root
   */
  revert(files: string[]): Promise<void>;

  // -------------------------------------------------------------------------
  // Commit History
  // -------------------------------------------------------------------------

  /**
   * Get commit history with pagination support.
   *
   * Returns commits in topological order (newest first), which is required
   * for correct swimlane graph computation.
   *
   * @param options - Pagination and filtering options
   * @returns Paginated commit history result
   *
   * @example
   * ```typescript
   * // Get first 50 commits
   * const result = await provider.getCommitHistory({ limit: 50 });
   *
   * // Load more commits
   * if (result.hasMore) {
   *   const more = await provider.getCommitHistory({ limit: 50, skip: 50 });
   * }
   * ```
   */
  getCommitHistory(
    options?: GetCommitHistoryOptions,
  ): Promise<CommitHistoryResult>;

  /**
   * Get a single commit by its hash.
   *
   * @param commitId - Full or short commit hash
   * @returns The commit, or null if not found
   */
  getCommit(commitId: string): Promise<HistoryCommit | null>;

  /**
   * Get files changed in a specific commit.
   *
   * Returns the list of files modified by the commit with their
   * status (added/modified/deleted/renamed) and diff statistics.
   *
   * @param commitId - Full or short commit hash
   * @returns Array of files changed in the commit
   */
  getCommitFiles(commitId: string): Promise<CommitFile[]>;

  /**
   * Get tracked branch information for VS Code-style graph coloring.
   *
   * Returns information about three special branches:
   * 1. Current branch (where HEAD points) - for blue color segment
   * 2. Upstream tracking branch - for purple color segment
   * 3. Base branch (where feature was created from) - for orange color segment
   *
   * Used to:
   * - Display ref badges with distinct colors
   * - Color swimlane segments in the commit graph
   *
   * @returns Tracked branch info, with null for unavailable branches
   */
  getTrackedBranches(): Promise<TrackedBranchInfo>;

  /**
   * Get file content at a specific commit.
   *
   * Retrieves the content of a file as it existed at a particular commit.
   * Used for displaying historical diffs.
   *
   * @param commitId - Full or short commit hash
   * @param filePath - Relative path from git root
   * @returns File content, or null if file doesn't exist at that commit
   */
  getFileAtCommit(commitId: string, filePath: string): Promise<string | null>;

  // -------------------------------------------------------------------------
  // Operations
  // -------------------------------------------------------------------------

  /**
   * Stage files for commit.
   *
   * @param files - Relative paths from git root
   */
  stage(files: string[]): Promise<void>;

  /**
   * Unstage files (remove from index).
   *
   * @param files - Relative paths from git root
   */
  unstage(files: string[]): Promise<void>;

  /**
   * Create a commit.
   *
   * @param message - Commit message
   * @param options - Commit options (files, amend, signoff)
   * @returns The created commit
   */
  commit(message: string, options?: GitCommitOptions): Promise<GitCommit>;

  /**
   * Checkout a branch or ref.
   *
   * @param ref - Branch name, tag, or commit hash
   * @param options - Checkout options (force)
   */
  checkout(ref: string, options?: GitCheckoutOptions): Promise<void>;

  /**
   * Stash current uncommitted changes.
   *
   * Saves both staged and unstaged changes to the stash.
   * Optionally includes a message to identify the stash.
   *
   * @param message - Optional message for the stash entry
   */
  stash(message?: string): Promise<void>;

  /**
   * Apply and remove the most recent stash entry.
   *
   * Restores the previously stashed changes to the working directory.
   * Throws if there are no stash entries or if applying fails due to conflicts.
   */
  stashPop(): Promise<void>;

  /**
   * Push commits to remote.
   *
   * @param force - If true, use --force-with-lease for safer force push
   * @param setUpstream - If true, set upstream tracking (for new branches)
   */
  push(force?: boolean, setUpstream?: boolean): Promise<void>;

  /**
   * Pull changes from remote.
   *
   * @param rebase - If true, use rebase instead of merge
   */
  pull(rebase?: boolean): Promise<void>;

  /**
   * Check if the current branch has an upstream (tracking) branch configured.
   *
   * @returns true if an upstream is configured, false otherwise
   */
  hasUpstream(): Promise<boolean>;

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  /** Fired when any file's git status changes */
  readonly onStatusChanged: Event<GitStatusChangedEvent>;

  /** Fired when the current branch changes */
  readonly onBranchChanged: Event<GitBranchChangedEvent>;

  /** Fired when a commit is created */
  readonly onCommitCreated: Event<GitCommitCreatedEvent>;

  /** Fired when HEAD moves (checkout, reset, rebase, etc.) */
  readonly onHeadChanged: Event<GitHeadChangedEvent>;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Clean up resources (stop .git/ watcher, clear timers, etc.).
   *
   * Called automatically by GitProviderService when reference
   * count drops to zero and grace period expires.
   */
  dispose(): void;
}
