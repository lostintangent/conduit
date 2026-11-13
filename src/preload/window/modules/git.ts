/**
 * Git v2 Preload Module
 *
 * Exposes the git provider v2 IPC channels to the renderer process.
 * This module provides low-level access to git operations. For a
 * higher-level API with subscription management, use the GitV2API
 * class in the renderer.
 *
 * Note: Git status uses Maps internally, but Maps can't be serialized
 * over IPC. The main process converts them to plain objects, and
 * the GitV2API class reconstructs Maps on the renderer side.
 *
 * @see src/renderer/api/GitV2API.ts
 * @see src/ipc/git/main/handlers.ts
 */

import { ipcRenderer } from "electron";
import type {
  FileWithTime,
  GitCommitOptions,
  GitFileStatus,
  TrackedBranchInfo,
} from "../../../ipc/git/types";
import { createEventListener } from "../utils";

// ============================================================================
// Serialized Types (for IPC transport)
// ============================================================================

/**
 * Serialized git status for IPC transport.
 *
 * The files Map is converted to a plain object.
 */
export interface SerializedGitStatus {
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  files: Record<string, GitFileStatus>;
}

/**
 * Serialized git commit for IPC transport.
 */
export interface SerializedGitCommit {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: number; // Timestamp instead of Date
  message: string;
  parents: string[];
}

/**
 * Serialized git branch for IPC transport.
 */
export interface SerializedGitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  commit: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  lastCommitDate?: number;
  lastCommitMessage?: string;
}

/**
 * Serialized diff stats for IPC transport.
 */
export interface SerializedDiffStats {
  added: number;
  removed: number;
  files: number;
}

/**
 * Serialized history commit for IPC transport.
 */
export interface SerializedHistoryCommit {
  id: string;
  shortId: string;
  subject: string;
  message: string;
  author: string;
  authorEmail: string;
  timestamp: number;
  parentIds: string[];
  refs?: string[];
}

/**
 * Serialized commit file for IPC transport.
 */
export interface SerializedCommitFile {
  path: string;
  status: string;
  originalPath?: string;
  additions: number;
  deletions: number;
  isBinary: boolean;
}

/**
 * Serialized commit history result for IPC transport.
 */
export interface SerializedCommitHistoryResult {
  commits: SerializedHistoryCommit[];
  hasMore: boolean;
  totalCount?: number;
}

/**
 * Options for fetching commit history.
 */
export interface GetCommitHistoryOptions {
  limit?: number;
  skip?: number;
  ref?: string;
}

/**
 * Serialized per-file diff stats map for IPC transport.
 * Object with file paths as keys instead of Map.
 */
export interface SerializedPerFileDiffStatsMap {
  [filePath: string]: { added: number; removed: number };
}

/**
 * Serialized split per-file diff stats for IPC transport.
 * Separated by staged/unstaged.
 */
export interface SerializedSplitPerFileDiffStats {
  staged: SerializedPerFileDiffStatsMap;
  unstaged: SerializedPerFileDiffStatsMap;
}

// ============================================================================
// Event Payload Types
// ============================================================================

/**
 * Payload for status changed events.
 */
export interface StatusChangedPayload {
  subscriptionId: string;
  gitRoot: string;
  status: SerializedGitStatus;
  added: string[];
  modified: string[];
  removed: string[];
}

/**
 * Payload for branch changed events.
 */
export interface BranchChangedPayload {
  subscriptionId: string;
  gitRoot: string;
  previousBranch: string;
  currentBranch: string;
}

/**
 * Payload for commit created events.
 */
export interface CommitCreatedPayload {
  subscriptionId: string;
  gitRoot: string;
  commit: SerializedGitCommit;
}

/**
 * Payload for HEAD changed events.
 */
export interface HeadChangedPayload {
  subscriptionId: string;
  gitRoot: string;
  previousHead: string;
  currentHead: string;
  isBranchSwitch: boolean;
}

// ============================================================================
// Module
// ============================================================================

export default {
  // ---------------------------------------------------------------------------
  // Status Operations
  // ---------------------------------------------------------------------------

  /**
   * Get complete repository status.
   *
   * @param cwd - Working directory (will be resolved to git root)
   * @returns Serialized git status, or null if not a git repo
   */
  getStatus: (cwd: string) =>
    ipcRenderer.invoke("git-v2:status", {
      cwd,
    }) as Promise<SerializedGitStatus | null>,

  /**
   * Get status for a specific file.
   *
   * @param cwd - Working directory
   * @param filePath - Path to file (relative to git root)
   * @returns File status, or null if file is clean
   */
  getFileStatus: (cwd: string, filePath: string) =>
    ipcRenderer.invoke("git-v2:file-status", {
      cwd,
      filePath,
    }) as Promise<GitFileStatus | null>,

  /**
   * Check if repository has uncommitted changes.
   *
   * @param cwd - Working directory
   * @returns true if there are uncommitted changes
   */
  hasUncommittedChanges: (cwd: string) =>
    ipcRenderer.invoke("git-v2:has-uncommitted-changes", {
      cwd,
    }) as Promise<boolean>,

  /**
   * Check if repository has unpushed commits.
   *
   * @param cwd - Working directory
   * @returns true if there are unpushed commits
   */
  hasUnpushedCommits: (cwd: string) =>
    ipcRenderer.invoke("git-v2:has-unpushed-commits", {
      cwd,
    }) as Promise<boolean>,

  // ---------------------------------------------------------------------------
  // Diff Operations
  // ---------------------------------------------------------------------------

  /**
   * Get diff for a specific file.
   *
   * @param cwd - Working directory
   * @param filePath - Path to file
   * @param staged - If true, show staged changes; if false, unstaged
   * @returns Unified diff string, or null if not a git repo
   */
  getFileDiff: (cwd: string, filePath: string, staged?: boolean) =>
    ipcRenderer.invoke("git-v2:file-diff", {
      cwd,
      filePath,
      staged,
    }) as Promise<string | null>,

  /**
   * Get file content at a specific git ref.
   *
   * @param cwd - Working directory
   * @param filePath - Path to file
   * @param ref - Git ref (commit hash, branch name, 'HEAD', etc.)
   * @returns File content, or null if not found
   */
  getFileAtRef: (cwd: string, filePath: string, ref: string) =>
    ipcRenderer.invoke("git-v2:file-at-ref", {
      cwd,
      filePath,
      ref,
    }) as Promise<string | null>,

  // ---------------------------------------------------------------------------
  // Staging Operations
  // ---------------------------------------------------------------------------

  /**
   * Stage files for commit.
   *
   * @param cwd - Working directory
   * @param files - Paths to stage (relative to git root)
   */
  stage: (cwd: string, files: string[]) =>
    ipcRenderer.invoke("git-v2:stage", { cwd, files }) as Promise<void>,

  /**
   * Unstage files (remove from index).
   *
   * @param cwd - Working directory
   * @param files - Paths to unstage (relative to git root)
   */
  unstage: (cwd: string, files: string[]) =>
    ipcRenderer.invoke("git-v2:unstage", { cwd, files }) as Promise<void>,

  // ---------------------------------------------------------------------------
  // Commit Operations
  // ---------------------------------------------------------------------------

  /**
   * Create a commit.
   *
   * @param cwd - Working directory
   * @param message - Commit message
   * @param options - Commit options (amend, signoff, etc.)
   * @returns The created commit, or null if not a git repo
   */
  commit: (cwd: string, message: string, options?: GitCommitOptions) =>
    ipcRenderer.invoke("git-v2:commit", {
      cwd,
      message,
      options,
    }) as Promise<SerializedGitCommit | null>,

  // ---------------------------------------------------------------------------
  // Branch Operations
  // ---------------------------------------------------------------------------

  /**
   * Get current branch name.
   *
   * @param cwd - Working directory
   * @returns Branch name, 'HEAD' if detached, or null if not a git repo
   */
  getCurrentBranch: (cwd: string) =>
    ipcRenderer.invoke("git-v2:branch", { cwd }) as Promise<string | null>,

  /**
   * Get all branches (local and remote).
   *
   * @param cwd - Working directory
   * @returns Array of branches
   */
  getBranches: (cwd: string) =>
    ipcRenderer.invoke("git-v2:branches", { cwd }) as Promise<
      SerializedGitBranch[]
    >,

  /**
   * Checkout a branch or ref.
   *
   * @param cwd - Working directory
   * @param ref - Branch name, tag, or commit hash
   * @param force - If true, force checkout (discards local changes)
   */
  checkout: (cwd: string, ref: string, force?: boolean) =>
    ipcRenderer.invoke("git-v2:checkout", {
      cwd,
      ref,
      force,
    }) as Promise<void>,

  /**
   * Create a new branch and optionally switch to it.
   *
   * @param cwd - Working directory
   * @param branchName - Name for the new branch
   * @param checkout - Whether to switch to the new branch (default: true)
   * @param startPoint - Optional ref to start the branch from (default: HEAD)
   */
  createBranch: (
    cwd: string,
    branchName: string,
    checkout?: boolean,
    startPoint?: string,
  ) =>
    ipcRenderer.invoke("git-v2:create-branch", {
      cwd,
      branchName,
      checkout,
      startPoint,
    }) as Promise<void>,

  /**
   * Stash current uncommitted changes.
   *
   * @param cwd - Working directory
   * @param message - Optional message for the stash entry
   */
  stash: (cwd: string, message?: string) =>
    ipcRenderer.invoke("git-v2:stash", { cwd, message }) as Promise<void>,

  /**
   * Apply and remove the most recent stash entry.
   *
   * @param cwd - Working directory
   */
  stashPop: (cwd: string) =>
    ipcRenderer.invoke("git-v2:stash-pop", { cwd }) as Promise<void>,

  // ---------------------------------------------------------------------------
  // Remote Operations
  // ---------------------------------------------------------------------------

  /**
   * Push commits to remote.
   *
   * @param cwd - Working directory
   * @param force - If true, use --force-with-lease for safer force push
   * @param setUpstream - If true, set upstream tracking (for new branches)
   */
  push: (cwd: string, force?: boolean, setUpstream?: boolean) =>
    ipcRenderer.invoke("git-v2:push", {
      cwd,
      force,
      setUpstream,
    }) as Promise<void>,

  /**
   * Pull changes from remote.
   *
   * @param cwd - Working directory
   * @param rebase - If true, use rebase instead of merge
   */
  pull: (cwd: string, rebase?: boolean) =>
    ipcRenderer.invoke("git-v2:pull", { cwd, rebase }) as Promise<void>,

  /**
   * Check if the current branch has an upstream (tracking) branch.
   *
   * @param cwd - Working directory
   * @returns true if upstream is configured, false otherwise
   */
  hasUpstream: (cwd: string) =>
    ipcRenderer.invoke("git-v2:has-upstream", {
      cwd,
    }) as Promise<boolean>,

  // ---------------------------------------------------------------------------
  // Comparison Operations
  // ---------------------------------------------------------------------------

  /**
   * Get files changed between current HEAD and a base branch.
   *
   * @param cwd - Working directory
   * @param baseBranch - Branch to compare against (e.g., 'main')
   * @returns Array of relative file paths
   */
  getChangedFilesFromBranch: (cwd: string, baseBranch: string) =>
    ipcRenderer.invoke("git-v2:changed-files-from-branch", {
      cwd,
      baseBranch,
    }) as Promise<string[]>,

  /**
   * Get git status relative to a base branch.
   *
   * Returns files with proper status (added, modified, deleted, renamed).
   *
   * @param cwd - Working directory
   * @param baseBranch - Branch to compare against (e.g., 'main')
   * @returns Object of relative file paths to their GitFileStatus
   */
  getStatusFromBranch: (cwd: string, baseBranch: string) =>
    ipcRenderer.invoke("git-v2:status-from-branch", {
      cwd,
      baseBranch,
    }) as Promise<Record<string, GitFileStatus>>,

  /**
   * Get diff statistics for uncommitted changes (lines added/removed).
   *
   * @param cwd - Working directory
   * @returns Statistics about uncommitted changes
   */
  getUncommittedDiffStats: (cwd: string) =>
    ipcRenderer.invoke("git-v2:uncommitted-diff-stats", {
      cwd,
    }) as Promise<SerializedDiffStats>,

  /**
   * Get per-file diff statistics for uncommitted changes.
   *
   * @param cwd - Working directory
   * @returns Split stats for staged and unstaged changes
   */
  getPerFileDiffStats: (cwd: string) =>
    ipcRenderer.invoke("git-v2:per-file-diff-stats", {
      cwd,
    }) as Promise<SerializedSplitPerFileDiffStats>,

  /**
   * Get the most recently modified dirty file.
   *
   * @param cwd - Working directory
   * @returns Relative path from git root, or null if no dirty files
   */
  getMostRecentDirtyFile: (cwd: string) =>
    ipcRenderer.invoke("git-v2:most-recent-dirty-file", {
      cwd,
    }) as Promise<string | null>,

  /**
   * Get the most recently modified file from recent commits.
   *
   * @param cwd - Working directory
   * @param commitLimit - Number of recent commits to check (default: 10)
   * @returns Relative path from git root, or null if none found
   */
  getMostRecentCommittedFile: (cwd: string, commitLimit?: number) =>
    ipcRenderer.invoke("git-v2:most-recent-committed-file", {
      cwd,
      commitLimit,
    }) as Promise<string | null>,

  /**
   * Get all dirty files with their modification timestamps.
   *
   * @param cwd - Working directory
   * @returns Array of files with their modification times, sorted most recent first
   */
  getDirtyFilesWithTimes: (cwd: string) =>
    ipcRenderer.invoke("git-v2:dirty-files-with-times", {
      cwd,
    }) as Promise<FileWithTime[]>,

  /**
   * Revert changes to files (discard local modifications).
   *
   * @param cwd - Working directory
   * @param files - Relative paths from git root
   */
  revert: (cwd: string, files: string[]) =>
    ipcRenderer.invoke("git-v2:revert", { cwd, files }) as Promise<void>,

  // ---------------------------------------------------------------------------
  // Commit History Operations
  // ---------------------------------------------------------------------------

  /**
   * Get commit history with pagination support.
   *
   * @param cwd - Working directory
   * @param options - Pagination options (limit, skip, ref)
   * @returns Paginated commit history result
   */
  getCommitHistory: (cwd: string, options?: GetCommitHistoryOptions) =>
    ipcRenderer.invoke("git-v2:commit-history", {
      cwd,
      options,
    }) as Promise<SerializedCommitHistoryResult>,

  /**
   * Get a single commit by its hash.
   *
   * @param cwd - Working directory
   * @param commitId - Full or short commit hash
   * @returns The commit, or null if not found
   */
  getCommit: (cwd: string, commitId: string) =>
    ipcRenderer.invoke("git-v2:get-commit", {
      cwd,
      commitId,
    }) as Promise<SerializedHistoryCommit | null>,

  /**
   * Get files changed in a specific commit.
   *
   * @param cwd - Working directory
   * @param commitId - Full or short commit hash
   * @returns Array of files changed in the commit
   */
  getCommitFiles: (cwd: string, commitId: string) =>
    ipcRenderer.invoke("git-v2:commit-files", {
      cwd,
      commitId,
    }) as Promise<SerializedCommitFile[]>,

  /**
   * Get file content at a specific commit.
   *
   * @param cwd - Working directory
   * @param commitId - Full or short commit hash
   * @param filePath - Relative path from git root
   * @returns File content, or null if file doesn't exist at that commit
   */
  getFileAtCommit: (cwd: string, commitId: string, filePath: string) =>
    ipcRenderer.invoke("git-v2:file-at-commit", {
      cwd,
      commitId,
      filePath,
    }) as Promise<string | null>,

  /**
   * Get tracked branch information for the current branch.
   *
   * Returns the current branch, its upstream, and base branch with their commit IDs.
   * Used for VS Code-style branch coloring in the commit graph.
   *
   * @param cwd - Working directory
   * @returns Tracked branch info (current, upstream, base)
   */
  getTrackedBranches: (cwd: string) =>
    ipcRenderer.invoke("git-v2:tracked-branches", {
      cwd,
    }) as Promise<TrackedBranchInfo>,

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Find the git root for a path.
   *
   * @param cwd - Working directory
   * @returns Git root path, or null if not a git repo
   */
  findRoot: (cwd: string) =>
    ipcRenderer.invoke("git-v2:find-root", { cwd }) as Promise<string | null>,

  /**
   * Check if git is available on the system.
   *
   * This checks if the git executable is installed and accessible.
   * Result is cached on the main process side.
   *
   * @returns True if git is installed and accessible
   */
  isGitAvailable: () =>
    ipcRenderer.invoke("git-v2:is-available") as Promise<boolean>,

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to git events.
   *
   * @param cwd - Working directory
   * @returns Subscription ID, or null if not a git repo
   */
  subscribe: (cwd: string) =>
    ipcRenderer.invoke("git-v2:subscribe", { cwd }) as Promise<string | null>,

  /**
   * Unsubscribe from git events.
   *
   * @param subscriptionId - ID returned from subscribe
   */
  unsubscribe: (subscriptionId: string) =>
    ipcRenderer.invoke("git-v2:unsubscribe", {
      subscriptionId,
    }) as Promise<void>,

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  /**
   * Listen for status changes.
   *
   * @param listener - Callback for status changed events
   * @returns Cleanup function to stop listening
   */
  onStatusChanged: (listener: (payload: StatusChangedPayload) => void) =>
    createEventListener<StatusChangedPayload>(
      "git-v2:status-changed",
      listener,
    ),

  /**
   * Listen for branch changes.
   *
   * @param listener - Callback for branch changed events
   * @returns Cleanup function to stop listening
   */
  onBranchChanged: (listener: (payload: BranchChangedPayload) => void) =>
    createEventListener<BranchChangedPayload>(
      "git-v2:branch-changed",
      listener,
    ),

  /**
   * Listen for commit creation.
   *
   * @param listener - Callback for commit created events
   * @returns Cleanup function to stop listening
   */
  onCommitCreated: (listener: (payload: CommitCreatedPayload) => void) =>
    createEventListener<CommitCreatedPayload>(
      "git-v2:commit-created",
      listener,
    ),

  /**
   * Listen for HEAD changes.
   *
   * @param listener - Callback for HEAD changed events
   * @returns Cleanup function to stop listening
   */
  onHeadChanged: (listener: (payload: HeadChangedPayload) => void) =>
    createEventListener<HeadChangedPayload>("git-v2:head-changed", listener),
};
