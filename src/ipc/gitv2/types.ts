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
   * @returns null if file has no changes (is clean)
   */
  getFileStatus(path: string): Promise<GitFileStatus | null>;

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
   * @param staged - If true, show staged changes; if false, unstaged changes
   * @returns Unified diff string
   */
  getFileDiff(path: string, staged?: boolean): Promise<string>;

  /**
   * Get file content at a specific ref (commit, branch, tag).
   *
   * Useful for showing the "original" version in diff views.
   *
   * @param ref - Git ref (e.g., 'HEAD', 'main', commit hash)
   * @throws If file doesn't exist at that ref
   */
  getFileAtRef(path: string, ref: string): Promise<string>;

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
   * Get diff statistics for uncommitted changes (lines added/removed).
   *
   * @returns Statistics about uncommitted changes
   */
  getUncommittedDiffStats(): Promise<GitDiffStats>;

  /**
   * Get the most recently modified dirty file.
   *
   * Useful for auto-selecting a file when opening the editor.
   *
   * @returns Relative path from git root, or null if no dirty files
   */
  getMostRecentDirtyFile(): Promise<string | null>;

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
   */
  checkout(ref: string): Promise<void>;

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
