/**
 * Git's types, shared by the main side and the renderer.
 *
 * Unlike the file system's providers (CWD-scoped), a git provider is
 * repository-scoped: CWDs within the same repository share one instance.
 *
 * Design Philosophy:
 * - Repository-scoped: One provider per git root, not per CWD
 * - Semantic events: Events describe what changed, not how we detected it
 * - Efficient payloads: Include both full state and delta for flexibility
 *
 * @see docs/architecture/filesystem-provider-design-narrative.md
 */

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
 * Per-file diff statistics (lines added/removed).
 */
export interface FileDiffStat {
  /** Lines added in this file */
  added: number;

  /** Lines removed from this file */
  removed: number;
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

/** An event from a `git.subscribe` watcher, which carries its id. */
type Subscribed<Event> = Event & { subscriptionId: string };

declare module "@shared/rpc" {
  interface Events {
    git: {
      statusChanged: Subscribed<GitStatusChangedEvent>;
      branchChanged: Subscribed<GitBranchChangedEvent>;
      headChanged: Subscribed<GitHeadChangedEvent>;
    };
  }
}
