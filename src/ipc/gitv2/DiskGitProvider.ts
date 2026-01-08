/**
 * DiskGitProvider - Git provider implementation using simple-git.
 *
 * This provider implements the GitProvider interface, providing unified
 * git operations with integrated status watching and debounced updates.
 *
 * Key Features:
 * 1. **Repository-Scoped**: One provider per git root, not per CWD
 * 2. **Debounced Status**: 100ms debounce prevents thrashing during operations
 * 3. **Smart .git/ Watching**: Ignores noisy paths like objects/, logs/
 * 4. **Operation Tracking**: Doesn't refresh during active git operations
 * 5. **Semantic Events**: Events describe what changed meaningfully
 *
 * Architecture:
 * ```
 * DiskGitProvider
 * ├── simple-git (git operations)
 * ├── ParcelFileWatcher (.git directory watching)
 * └── EventEmitters (notifications)
 * ```
 */

import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";

import { EventEmitter } from "../../shared/EventEmitter";
import { ParcelFileWatcher } from "../fsv2/ParcelFileWatcher";
import { isCaseInsensitiveFS } from "../fsv2/pathUtils";
import type { Disposable, Event } from "../fsv2/types";
import type {
  CommitFile,
  CommitHistoryResult,
  FileWithTime,
  GetCommitHistoryOptions,
  GitBranch,
  GitBranchChangedEvent,
  GitCheckoutOptions,
  GitCommit,
  GitCommitCreatedEvent,
  GitCommitOptions,
  GitFileStatus,
  GitFileStatusCode,
  GitHeadChangedEvent,
  GitProvider,
  GitStatus,
  GitStatusChangedEvent,
  HistoryCommit,
  TrackedBranch,
  TrackedBranchInfo,
} from "./types";

// ============================================================================
// Constants
// ============================================================================

/** Delay before refreshing status after a .git/ change (ms) */
const STATUS_REFRESH_DEBOUNCE_MS = 100;

/**
 * Suffix appended to Map keys for unstaged entries of partially staged files.
 *
 * When a file has both staged and unstaged changes (e.g., git status "MM"),
 * we create two entries:
 * - Staged entry: key = path
 * - Unstaged entry: key = path + UNSTAGED_KEY_SUFFIX
 *
 * This allows consumers iterating over entries to see both states while
 * maintaining backward compatibility for .get(path) lookups.
 */
const UNSTAGED_KEY_SUFFIX = "\0unstaged";

/**
 * Paths within .git/ to ignore when watching.
 *
 * We only care about files that indicate meaningful status changes:
 * - index: Staging area (staged/unstaged files)
 * - HEAD: Current branch/commit
 * - refs/heads/*: Local branch tips
 * - MERGE_HEAD, REBASE_HEAD, etc.: Merge/rebase state
 *
 * Everything else is noise:
 * - objects/: Object database, changes constantly
 * - logs/: Reflog, updates on every operation
 * - hooks/: Scripts, never affects status
 * - info/: Exclude patterns, sparse checkout
 * - *.lock: Temporary lock files
 * - Various temp files created during operations
 */
const IGNORED_GIT_PATHS = [
  // High-frequency noise
  "**/objects/**",
  "**/logs/**",
  "**/*.lock",

  // Temp files created during operations
  "**/COMMIT_EDITMSG",
  "**/FETCH_HEAD",
  "**/ORIG_HEAD",
  "**/MERGE_MSG",
  "**/SQUASH_MSG",
  "**/AUTO_MERGE",

  // Static/config files that don't affect status
  "**/hooks/**",
  "**/info/**",
  "**/description",
  "**/config",
  "**/packed-refs",
  "**/shallow",
  "**/commondir",
  "**/gitdir",
];

// ============================================================================
// DiskGitProvider
// ============================================================================

/**
 * Git provider implementation using simple-git.
 *
 * @example
 * ```typescript
 * const provider = new DiskGitProvider('/project', '/project/src');
 *
 * // Get status
 * const status = await provider.getStatus();
 * console.log('Branch:', status.branch);
 * console.log('Changed files:', status.files.size);
 *
 * // Subscribe to changes
 * provider.onStatusChanged((event) => {
 *   console.log('Status changed:', event.added.length, 'new files');
 * });
 *
 * // Stage and commit
 * await provider.stage(['src/file.ts']);
 * await provider.commit('Add new feature');
 *
 * // Cleanup
 * provider.dispose();
 * ```
 */
export class DiskGitProvider implements GitProvider {
  readonly gitRoot: string;
  readonly cwd: string;

  // -------------------------------------------------------------------------
  // Internal Components
  // -------------------------------------------------------------------------

  private git: SimpleGit;
  private watcher: ParcelFileWatcher | null = null;
  private watcherSubscriptions: Disposable[] = [];
  private disposed = false;

  /** Count of active git operations (don't refresh while > 0) */
  private activeOperations = 0;

  /** Pending status refresh timer (debouncing) */
  private refreshTimer: NodeJS.Timeout | null = null;

  /** Last known status (for delta calculation) */
  private lastStatus: GitStatus | null = null;

  /** Last known branch (for branch change detection) */
  private lastBranch: string | null = null;

  /** Last known HEAD commit (for head change detection) */
  private lastHead: string | null = null;

  /** Cached per-file diff stats (single source of truth for all diff stat queries) */
  private perFileDiffStatsCache: {
    result: {
      staged: Map<string, { added: number; removed: number }>;
      unstaged: Map<string, { added: number; removed: number }>;
    };
    timestamp: number;
  } | null = null;

  /** Cache TTL for diff stats (ms) - short window to deduplicate concurrent calls */
  private static readonly DIFF_STATS_CACHE_TTL_MS = 100;

  // -------------------------------------------------------------------------
  // Event Emitters
  // -------------------------------------------------------------------------

  private readonly _onStatusChanged = new EventEmitter<GitStatusChangedEvent>();
  private readonly _onBranchChanged = new EventEmitter<GitBranchChangedEvent>();
  private readonly _onCommitCreated = new EventEmitter<GitCommitCreatedEvent>();
  private readonly _onHeadChanged = new EventEmitter<GitHeadChangedEvent>();

  readonly onStatusChanged: Event<GitStatusChangedEvent> =
    this._onStatusChanged.event;
  readonly onBranchChanged: Event<GitBranchChangedEvent> =
    this._onBranchChanged.event;
  readonly onCommitCreated: Event<GitCommitCreatedEvent> =
    this._onCommitCreated.event;
  readonly onHeadChanged: Event<GitHeadChangedEvent> =
    this._onHeadChanged.event;

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  /**
   * Create a new git provider.
   *
   * @param gitRoot - The git repository root directory (contains .git/)
   * @param cwd - The working directory for relative path resolution
   */
  constructor(gitRoot: string, cwd: string) {
    this.gitRoot = path.resolve(gitRoot);
    this.cwd = path.resolve(cwd);

    // Initialize simple-git
    this.git = simpleGit(this.gitRoot);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start watching the .git directory for changes.
   *
   * This should be called after setting up event listeners.
   */
  async startWatching(): Promise<void> {
    if (this.disposed || this.watcher) {
      return;
    }

    const gitDir = path.join(this.gitRoot, ".git");

    // Check if .git is a file (worktree) or directory
    let watchPath: string;
    try {
      const gitStat = fs.statSync(gitDir);
      watchPath = gitStat.isFile() ? this.resolveGitDir(gitDir) : gitDir;
    } catch {
      // .git doesn't exist yet or is inaccessible
      return;
    }

    // Create watcher with custom ignore patterns for .git directory
    this.watcher = new ParcelFileWatcher(watchPath, {
      ignored: IGNORED_GIT_PATHS,
    });

    // Subscribe to all watcher events - any change triggers status refresh
    this.watcherSubscriptions.push(
      this.watcher.onCreated(() => this.scheduleStatusRefresh()),
      this.watcher.onModified(() => this.scheduleStatusRefresh()),
      this.watcher.onDeleted(() => this.scheduleStatusRefresh()),
      this.watcher.onRenamed(() => this.scheduleStatusRefresh()),
    );

    // Start watching
    await this.watcher.watch();

    // Initialize last known state
    await this.initializeState();
  }

  /**
   * Check if currently watching for changes.
   */
  isWatching(): boolean {
    return this.watcher !== null && !this.disposed;
  }

  /**
   * Trigger a status refresh.
   *
   * This is called when working directory files change (detected by FileSystemV2).
   * Uses the same debouncing as internal .git directory changes.
   */
  triggerStatusRefresh(): void {
    this.scheduleStatusRefresh();
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    // Clear refresh timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Dispose watcher subscriptions
    for (const subscription of this.watcherSubscriptions) {
      subscription.dispose();
    }
    this.watcherSubscriptions = [];

    // Stop watcher
    if (this.watcher) {
      this.watcher.dispose().catch((error: unknown) => {
        console.error("[DiskGitProvider] Error disposing watcher:", error);
      });
      this.watcher = null;
    }

    // Dispose emitters
    this._onStatusChanged.dispose();
    this._onBranchChanged.dispose();
    this._onCommitCreated.dispose();
    this._onHeadChanged.dispose();
  }

  // -------------------------------------------------------------------------
  // State Queries
  // -------------------------------------------------------------------------

  /**
   * Get complete repository status.
   */
  async getStatus(): Promise<GitStatus> {
    const [statusResult, branchSummary] = await Promise.all([
      this.git.status(),
      this.git.branch(),
    ]);

    return this.parseStatus(statusResult, branchSummary.current);
  }

  /**
   * Get status for a specific file.
   */
  async getFileStatus(filePath: string): Promise<GitFileStatus | null> {
    const status = await this.getStatus();
    const relativePath = this.toRelativePath(filePath);

    // Try exact match first
    const exactMatch = status.files.get(relativePath);
    if (exactMatch) {
      return exactMatch;
    }

    // On case-insensitive filesystems, try case-insensitive lookup
    if (isCaseInsensitiveFS) {
      const normalizedLookup = relativePath.toLowerCase();
      for (const [key, value] of status.files) {
        if (key.toLowerCase() === normalizedLookup) {
          return value;
        }
      }
    }

    return null;
  }

  /**
   * Get current branch name.
   *
   * Note: Uses raw git command instead of simple-git's branch() method
   * because rev-parse is ~35% faster (benchmarked at 40ms vs 65ms avg).
   */
  async getCurrentBranch(): Promise<string> {
    const result = await this.git.raw(["rev-parse", "--abbrev-ref", "HEAD"]);
    return result.trim() || "HEAD";
  }

  /**
   * Get all branches (local and remote).
   */
  async getBranches(): Promise<GitBranch[]> {
    // Use for-each-ref to get more detailed branch info including commit date/message
    // Include full refname to distinguish local from remote branches
    const result = await this.git.raw([
      "for-each-ref",
      "--sort=-committerdate",
      "--format=%(refname:short)|%(refname)|%(committerdate:iso8601)|%(objectname:short)|%(subject)|%(HEAD)",
      "refs/heads/",
      "refs/remotes/",
    ]);

    const branches: GitBranch[] = [];
    const lines = result.split("\n").filter(Boolean);

    for (const line of lines) {
      const parts = line.split("|");
      if (parts.length < 5) continue;

      const name = parts[0]?.trim() || "";
      const fullRefname = parts[1]?.trim() || "";
      const dateStr = parts[2]?.trim() || "";
      const commit = parts[3]?.trim() || "";
      const message = parts[4]?.trim() || "";
      const isCurrentMarker = parts[5]?.trim() || "";

      if (!name) continue;

      // Skip HEAD entries
      if (name === "HEAD" || name.includes("HEAD")) {
        continue;
      }

      // Use full refname to determine if remote (not the short name, which may contain slashes)
      const isRemote = fullRefname.startsWith("refs/remotes/");
      const isCurrent = isCurrentMarker === "*";

      branches.push({
        name,
        isRemote,
        isCurrent,
        commit,
        upstream: undefined,
        lastCommitDate: dateStr ? new Date(dateStr) : undefined,
        lastCommitMessage: message || undefined,
      });
    }

    return branches;
  }

  /**
   * Get diff for a specific file.
   */
  async getFileDiff(filePath: string, staged = false): Promise<string> {
    const relativePath = this.toRelativePath(filePath);

    if (staged) {
      return this.git.diff(["--cached", "--", relativePath]);
    }
    return this.git.diff(["--", relativePath]);
  }

  /**
   * Get file content at a specific ref.
   */
  async getFileAtRef(filePath: string, ref: string): Promise<string> {
    const relativePath = this.toRelativePath(filePath);
    return this.git.show([`${ref}:${relativePath}`]);
  }

  /**
   * Check if there are uncommitted changes.
   */
  async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.git.status();
    return !status.isClean();
  }

  /**
   * Check if there are commits not pushed to upstream.
   */
  async hasUnpushedCommits(): Promise<boolean> {
    const status = await this.git.status();
    return status.ahead > 0;
  }

  /**
   * Get files changed between current HEAD and a base branch.
   *
   * Returns files that have been added, modified, or deleted
   * in the current branch compared to the base branch.
   */
  async getChangedFilesFromBranch(baseBranch: string): Promise<string[]> {
    try {
      // Get the merge base between current HEAD and base branch
      const mergeBase = await this.git.raw(["merge-base", "HEAD", baseBranch]);

      // Get files changed since the merge base
      const result = await this.git.diff([
        "--name-only",
        mergeBase.trim(),
        "HEAD",
      ]);

      return result
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    } catch (error) {
      console.error(
        "[DiskGitProvider] Failed to get files changed since branch:",
        error,
      );
      return [];
    }
  }

  /**
   * Get git status relative to a base branch.
   *
   * Returns files that have been added, modified, or deleted
   * in the current branch compared to the base branch, WITH their proper
   * status (added, modified, deleted, renamed).
   *
   * Also overlays working tree changes (uncommitted modifications).
   */
  async getStatusFromBranch(
    baseBranch: string,
  ): Promise<Map<string, GitFileStatus>> {
    const statusMap = new Map<string, GitFileStatus>();

    try {
      // Get the merge base between current HEAD and base branch
      const mergeBase = await this.git.raw(["merge-base", "HEAD", baseBranch]);

      // Get files changed since the merge base with status codes
      const result = await this.git.diff([
        "--name-status",
        mergeBase.trim(),
        "HEAD",
      ]);

      const lines = result.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;

        // Format: <status>\t<path> or <status>\t<old-path>\t<new-path> for renames
        const parts = line.split("\t");
        if (parts.length < 2) continue;

        const statusCode = parts[0]?.trim();
        // For renames, use the new path (parts[2]), otherwise use parts[1]
        const filePath =
          parts.length >= 3 ? parts[2]?.trim() : parts[1]?.trim();

        if (!statusCode || !filePath) continue;

        let status: GitFileStatus["status"] = "modified";

        if (statusCode.startsWith("A")) {
          status = "added";
        } else if (statusCode.startsWith("D")) {
          status = "deleted";
        } else if (statusCode.startsWith("M")) {
          status = "modified";
        } else if (statusCode.startsWith("R")) {
          status = "renamed";
        } else if (statusCode.startsWith("C")) {
          status = "copied";
        }

        statusMap.set(filePath, {
          status,
          staged: true, // Changes in commits are considered "staged"
          path: filePath,
        });
      }

      // Overlay working tree changes (uncommitted)
      const workingTreeStatus = await this.getStatus();
      if (workingTreeStatus?.files) {
        for (const [relativePath, status] of workingTreeStatus.files) {
          // Working tree changes override committed changes
          statusMap.set(relativePath, status);
        }
      }
    } catch (error) {
      console.error(
        "[DiskGitProvider] Failed to get status from branch:",
        error,
      );
    }

    return statusMap;
  }

  /**
   * Get diff statistics for uncommitted changes (lines added/removed).
   *
   * Derives aggregated stats from the cached per-file diff stats.
   * This ensures a single source of truth and avoids redundant git operations.
   */
  async getUncommittedDiffStats(): Promise<{
    added: number;
    removed: number;
    files: number;
  }> {
    try {
      // Derive from per-file stats (uses cache if available)
      const perFile = await this.getPerFileDiffStats();

      let totalAdded = 0;
      let totalRemoved = 0;
      const allFiles = new Set<string>();

      // Sum staged stats
      for (const [path, stat] of perFile.staged) {
        totalAdded += stat.added;
        totalRemoved += stat.removed;
        allFiles.add(path);
      }

      // Sum unstaged stats
      for (const [path, stat] of perFile.unstaged) {
        totalAdded += stat.added;
        totalRemoved += stat.removed;
        allFiles.add(path);
      }

      return {
        added: totalAdded,
        removed: totalRemoved,
        files: allFiles.size,
      };
    } catch (error) {
      console.error("[DiskGitProvider] Failed to get diff stats:", error);
      return { added: 0, removed: 0, files: 0 };
    }
  }

  /**
   * Get per-file diff statistics for uncommitted changes.
   *
   * Returns lines added/removed for each changed file, split by staged/unstaged.
   * - Staged: `git diff --numstat --cached` (index vs HEAD)
   * - Unstaged: `git diff --numstat` (working tree vs index)
   *
   * Results are cached for a short window (100ms) to deduplicate concurrent calls.
   * This is the single source of truth for all diff stat queries.
   */
  async getPerFileDiffStats(): Promise<{
    staged: Map<string, { added: number; removed: number }>;
    unstaged: Map<string, { added: number; removed: number }>;
  }> {
    // Check cache first
    const now = Date.now();
    if (
      this.perFileDiffStatsCache &&
      now - this.perFileDiffStatsCache.timestamp <
        DiskGitProvider.DIFF_STATS_CACHE_TTL_MS
    ) {
      return this.perFileDiffStatsCache.result;
    }

    const staged = new Map<string, { added: number; removed: number }>();
    const unstaged = new Map<string, { added: number; removed: number }>();

    const parseDiffOutput = (
      output: string,
      targetMap: Map<string, { added: number; removed: number }>,
    ) => {
      const lines = output.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        // Format: <added>\t<removed>\t<filename>
        // Binary files show "-" for added/removed
        const [addedStr, removedStr, ...filenameParts] = line.split("\t");
        const filename = filenameParts.join("\t"); // Handle filenames with tabs

        if (!filename) continue;

        const added = addedStr === "-" ? 0 : parseInt(addedStr, 10) || 0;
        const removed = removedStr === "-" ? 0 : parseInt(removedStr, 10) || 0;

        targetMap.set(filename, { added, removed });
      }
    };

    try {
      // Get staged changes (index vs HEAD)
      const stagedOutput = await this.git.diff(["--numstat", "--cached"]);
      parseDiffOutput(stagedOutput, staged);

      // Get unstaged changes (working tree vs index)
      const unstagedOutput = await this.git.diff(["--numstat"]);
      parseDiffOutput(unstagedOutput, unstaged);

      // Handle untracked files (not in git diff output)
      // Count lines in each untracked file and add to unstaged stats
      const status = await this.getStatus();
      const untrackedFiles = Array.from(status.files.entries()).filter(
        ([, fileStatus]) => fileStatus.status === "untracked",
      );

      // Read all untracked files in parallel
      const untrackedStats = await Promise.all(
        untrackedFiles.map(async ([filePath]) => {
          try {
            const fullPath = path.join(this.gitRoot, filePath);
            const content = await fsPromises.readFile(fullPath, "utf-8");
            // Count lines (consistent with how git counts)
            const lines = content.split("\n");
            // Git counts the final newline as a line only if there's content after it
            const added =
              lines.length > 0 && lines[lines.length - 1] === ""
                ? lines.length - 1
                : lines.length;
            return { filePath, added };
          } catch {
            // File might not exist or be unreadable (e.g., symlink to nowhere)
            return null;
          }
        }),
      );

      // Add results to unstaged map
      for (const stat of untrackedStats) {
        if (stat) {
          unstaged.set(stat.filePath, { added: stat.added, removed: 0 });
        }
      }

      // Cache the result
      const result = { staged, unstaged };
      this.perFileDiffStatsCache = { result, timestamp: now };

      return result;
    } catch (error) {
      console.error(
        "[DiskGitProvider] Failed to get per-file diff stats:",
        error,
      );
      return { staged, unstaged };
    }
  }

  /**
   * Get the most recently modified dirty file.
   *
   * Uses file modification times to find the file the user
   * was most likely working on.
   */
  async getMostRecentDirtyFile(): Promise<string | null> {
    try {
      const status = await this.git.status();

      if (status.files.length === 0) {
        return null;
      }

      // Get all dirty file paths
      const dirtyFiles = status.files.map((f) => f.path);

      // Find the most recently modified one
      let mostRecent: { path: string; mtime: number } | null = null;

      for (const filePath of dirtyFiles) {
        const absolutePath = path.join(this.gitRoot, filePath);
        try {
          const stats = await fsPromises.stat(absolutePath);
          if (!mostRecent || stats.mtimeMs > mostRecent.mtime) {
            mostRecent = { path: filePath, mtime: stats.mtimeMs };
          }
        } catch {
          // File might not exist (deleted)
        }
      }

      return mostRecent?.path ?? null;
    } catch (error) {
      console.error(
        "[DiskGitProvider] Failed to get most recent dirty file:",
        error,
      );
      return null;
    }
  }

  /**
   * Get all dirty files with their modification timestamps.
   *
   * Returns files sorted by modification time (most recent first).
   */
  async getDirtyFilesWithTimes(): Promise<FileWithTime[]> {
    try {
      const status = await this.git.status();

      if (status.files.length === 0) {
        return [];
      }

      // Get all dirty file paths with their modification times
      const filesWithTimes: FileWithTime[] = [];

      for (const file of status.files) {
        const absolutePath = path.join(this.gitRoot, file.path);
        try {
          const stats = await fsPromises.stat(absolutePath);
          filesWithTimes.push({
            path: file.path,
            mtime: stats.mtimeMs,
          });
        } catch {
          // File might not exist (deleted) - skip it
        }
      }

      // Sort by mtime descending (most recent first)
      filesWithTimes.sort((a, b) => b.mtime - a.mtime);

      return filesWithTimes;
    } catch (error) {
      console.error(
        "[DiskGitProvider] Failed to get dirty files with times:",
        error,
      );
      return [];
    }
  }

  /**
   * Get the most recently modified file from recent commits.
   *
   * Fallback when there are no dirty files.
   */
  async getMostRecentCommittedFile(commitLimit = 10): Promise<string | null> {
    try {
      // Get files from recent commits
      const log = await this.git.log({
        maxCount: commitLimit,
        "--name-only": null,
      });

      // Collect unique file paths from diff.files
      // simple-git puts --name-only results in the diff.files array, not body
      const filesSet = new Set<string>();
      for (const commit of log.all) {
        const diff = (commit as any).diff;
        if (diff?.files && Array.isArray(diff.files)) {
          for (const fileEntry of diff.files) {
            if (fileEntry.file) {
              filesSet.add(fileEntry.file);
            }
          }
        }
      }

      if (filesSet.size === 0) {
        return null;
      }

      // Find the most recently modified one that exists
      let mostRecent: { path: string; mtime: number } | null = null;

      for (const filePath of filesSet) {
        const absolutePath = path.join(this.gitRoot, filePath);
        try {
          const stats = await fsPromises.stat(absolutePath);
          if (!mostRecent || stats.mtimeMs > mostRecent.mtime) {
            mostRecent = { path: filePath, mtime: stats.mtimeMs };
          }
        } catch {
          // File might not exist anymore
        }
      }

      return mostRecent?.path ?? null;
    } catch (error) {
      console.error(
        "[DiskGitProvider] Failed to get most recent committed file:",
        error,
      );
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Commit History
  // -------------------------------------------------------------------------

  /**
   * Get commit history with pagination support.
   *
   * Returns commits in topological order (newest first) for correct
   * swimlane graph computation.
   */
  async getCommitHistory(
    options: GetCommitHistoryOptions = {},
  ): Promise<CommitHistoryResult> {
    const { limit = 50, skip = 0, ref } = options;

    try {
      // Request one extra commit to determine if there are more
      const requestLimit = limit + 1;

      // Build git log format for efficient parsing
      // Format: hash|shortHash|subject|author|email|timestamp|parentHashes|refs
      const format = "%H|%h|%s|%an|%ae|%at|%P|%D";

      const args = [
        "log",
        `--format=${format}`,
        "--topo-order", // Topological ordering for swimlane algorithm
        `-n`,
        String(requestLimit),
        `--skip=${skip}`,
      ];

      if (ref) {
        args.push(ref);
      }

      const result = await this.git.raw(args);
      const lines = result.trim().split("\n").filter(Boolean);

      // Check if there are more commits
      const hasMore = lines.length > limit;
      const commitLines = hasMore ? lines.slice(0, limit) : lines;

      const commits: HistoryCommit[] = commitLines.map((line) => {
        const parts = line.split("|");
        const [
          hash,
          shortHash,
          subject,
          author,
          email,
          timestamp,
          parents,
          refs,
        ] = parts;

        return {
          id: hash || "",
          shortId: shortHash || "",
          subject: subject || "",
          message: subject || "", // Just subject for now, full message requires separate call
          author: author || "",
          authorEmail: email || "",
          timestamp: parseInt(timestamp || "0", 10) * 1000, // Convert to milliseconds
          parentIds: parents ? parents.split(" ").filter(Boolean) : [],
          refs: refs ? refs.split(", ").filter(Boolean) : undefined,
        };
      });

      return {
        commits,
        hasMore,
      };
    } catch (error) {
      console.error("[DiskGitProvider] Failed to get commit history:", error);
      return {
        commits: [],
        hasMore: false,
      };
    }
  }

  /**
   * Get a single commit by its hash.
   */
  async getCommit(commitId: string): Promise<HistoryCommit | null> {
    try {
      // Format: hash|shortHash|subject|body|author|email|timestamp|parentHashes|refs
      const format = "%H|%h|%s|%b|%an|%ae|%at|%P|%D";

      const result = await this.git.raw([
        "log",
        `-1`,
        `--format=${format}`,
        commitId,
      ]);

      if (!result.trim()) {
        return null;
      }

      // Split by | but handle body which may contain | characters
      // Body is the 4th field, so we need to be careful
      const firstLine = result.split("\n")[0] || "";
      const parts = firstLine.split("|");

      if (parts.length < 8) {
        return null;
      }

      const [hash, shortHash, subject, ...rest] = parts;
      // Body might contain |, so join remaining parts except last 4
      const bodyParts = rest.slice(0, -4);
      const body = bodyParts.join("|");
      const [author, email, timestamp, parents, refs] = rest.slice(-5);

      const fullMessage = body ? `${subject}\n\n${body}` : subject || "";

      return {
        id: hash || "",
        shortId: shortHash || "",
        subject: subject || "",
        message: fullMessage,
        author: author || "",
        authorEmail: email || "",
        timestamp: parseInt(timestamp || "0", 10) * 1000,
        parentIds: parents ? parents.split(" ").filter(Boolean) : [],
        refs: refs ? refs.split(", ").filter(Boolean) : undefined,
      };
    } catch (error) {
      console.error("[DiskGitProvider] Failed to get commit:", error);
      return null;
    }
  }

  /**
   * Get files changed in a specific commit.
   */
  async getCommitFiles(commitId: string): Promise<CommitFile[]> {
    try {
      // Use --numstat for additions/deletions, --name-status for status codes
      // Combine with diff-tree for accurate results
      const result = await this.git.raw([
        "diff-tree",
        "--no-commit-id",
        "--name-status",
        "-r",
        "--find-renames",
        "-M",
        commitId,
      ]);

      // Also get numstat for additions/deletions
      const numstatResult = await this.git.raw([
        "diff-tree",
        "--no-commit-id",
        "--numstat",
        "-r",
        "--find-renames",
        "-M",
        commitId,
      ]);

      // Parse numstat for additions/deletions
      const statsMap = new Map<
        string,
        { additions: number; deletions: number; isBinary: boolean }
      >();
      const numstatLines = numstatResult.trim().split("\n").filter(Boolean);

      for (const line of numstatLines) {
        const [additions, deletions, ...pathParts] = line.split("\t");
        const filePath = pathParts.join("\t"); // Handle renamed files with tabs

        // Binary files show as "-" for additions/deletions
        const isBinary = additions === "-" || deletions === "-";

        statsMap.set(filePath, {
          additions: isBinary ? 0 : parseInt(additions || "0", 10),
          deletions: isBinary ? 0 : parseInt(deletions || "0", 10),
          isBinary,
        });
      }

      // Parse name-status for status codes
      const files: CommitFile[] = [];
      const statusLines = result.trim().split("\n").filter(Boolean);

      for (const line of statusLines) {
        const parts = line.split("\t");
        if (parts.length < 2) continue;

        const statusCode = parts[0]?.charAt(0) || "M";
        let filePath: string;
        let originalPath: string | undefined;

        // Handle renamed files (R100 oldpath newpath)
        if (statusCode === "R" || statusCode === "C") {
          originalPath = parts[1];
          filePath = parts[2] || parts[1] || "";
        } else {
          filePath = parts[1] || "";
        }

        const stats = statsMap.get(filePath) || {
          additions: 0,
          deletions: 0,
          isBinary: false,
        };

        files.push({
          path: filePath,
          status: this.statusCodeToFileStatus(statusCode),
          originalPath,
          additions: stats.additions,
          deletions: stats.deletions,
          isBinary: stats.isBinary,
        });
      }

      return files;
    } catch (error) {
      console.error("[DiskGitProvider] Failed to get commit files:", error);
      return [];
    }
  }

  /**
   * Get file content at a specific commit.
   */
  async getFileAtCommit(
    commitId: string,
    filePath: string,
  ): Promise<string | null> {
    try {
      const relativePath = this.toRelativePath(filePath);
      const result = await this.git.show([`${commitId}:${relativePath}`]);
      return result;
    } catch (error) {
      // File might not exist at this commit
      return null;
    }
  }

  /**
   * Get tracked branch information for VS Code-style graph coloring.
   *
   * Returns information about three special branches:
   * 1. Current branch - where HEAD points (blue segment)
   * 2. Upstream - remote tracking branch (purple segment)
   * 3. Base - branch from which feature was created (orange segment)
   */
  async getTrackedBranches(): Promise<TrackedBranchInfo> {
    try {
      // Get current branch name
      const currentBranchName = await this.getCurrentBranch();

      // If detached HEAD, no tracked branches
      if (currentBranchName === "HEAD") {
        return { current: null, upstream: null, base: null };
      }

      // Fetch all info in parallel for performance
      const [currentCommitId, upstreamInfo, baseInfo] = await Promise.all([
        this.resolveRef("HEAD"),
        this.getUpstreamInfo(currentBranchName),
        this.getBaseBranchInfo(currentBranchName),
      ]);

      // Build current branch info
      const current: TrackedBranch | null = currentCommitId
        ? {
            name: currentBranchName,
            displayName: currentBranchName,
            type: "current",
            commitId: currentCommitId,
          }
        : null;

      return {
        current,
        upstream: upstreamInfo,
        base: baseInfo,
      };
    } catch (error) {
      console.error("[DiskGitProvider] Failed to get tracked branches:", error);
      return { current: null, upstream: null, base: null };
    }
  }

  /**
   * Resolve a ref to its commit ID.
   */
  private async resolveRef(ref: string): Promise<string | null> {
    try {
      const result = await this.git.revparse([ref]);
      return result.trim();
    } catch {
      return null;
    }
  }

  /**
   * Get upstream tracking branch info.
   */
  private async getUpstreamInfo(
    branchName: string,
  ): Promise<TrackedBranch | null> {
    try {
      // Get upstream branch name (e.g., "origin/feature/foo")
      const upstreamRef = await this.git.revparse([
        "--abbrev-ref",
        `${branchName}@{upstream}`,
      ]);
      const upstreamName = upstreamRef.trim();

      if (!upstreamName) {
        return null;
      }

      // Get commit ID for upstream
      const commitId = await this.resolveRef(upstreamName);
      if (!commitId) {
        return null;
      }

      // Parse remote name from "origin/branch" format
      const slashIndex = upstreamName.indexOf("/");
      const remote =
        slashIndex > 0 ? upstreamName.slice(0, slashIndex) : undefined;

      return {
        name: upstreamName,
        displayName: upstreamName,
        type: "upstream",
        commitId,
        remote,
      };
    } catch {
      // No upstream configured
      return null;
    }
  }

  /**
   * Get base branch info (where the feature branch was created from).
   *
   * Strategy:
   * 1. Check git config for cached vscode-merge-base
   * 2. Parse reflog to find "Created from" entry
   * 3. Fall back to default branch (origin/main or origin/master)
   */
  private async getBaseBranchInfo(
    branchName: string,
  ): Promise<TrackedBranch | null> {
    try {
      // Strategy 1: Check git config for cached merge base
      const configKey = `branch.${branchName}.vscode-merge-base`;
      try {
        const cachedBase = await this.git.raw(["config", "--get", configKey]);
        const baseName = cachedBase.trim();
        if (baseName) {
          const commitId = await this.resolveRef(baseName);
          if (commitId) {
            const slashIndex = baseName.indexOf("/");
            return {
              name: baseName,
              displayName: baseName,
              type: "base",
              commitId,
              remote:
                slashIndex > 0 ? baseName.slice(0, slashIndex) : undefined,
            };
          }
        }
      } catch {
        // Config not set, continue to next strategy
      }

      // Strategy 2: Parse reflog to find where branch was created from
      const baseBranch = await this.getBaseBranchFromReflog(branchName);
      if (baseBranch) {
        // Cache the result for future lookups
        try {
          await this.git.raw(["config", configKey, baseBranch.name]);
        } catch {
          // Ignore config write errors
        }
        return baseBranch;
      }

      // Strategy 3: Fall back to default branch
      const defaultBranch = await this.getDefaultBranch();
      if (defaultBranch) {
        // Cache the result
        try {
          await this.git.raw(["config", configKey, defaultBranch.name]);
        } catch {
          // Ignore config write errors
        }
        return defaultBranch;
      }

      return null;
    } catch (error) {
      console.error("[DiskGitProvider] Failed to get base branch:", error);
      return null;
    }
  }

  /**
   * Try to determine base branch from reflog.
   */
  private async getBaseBranchFromReflog(
    branchName: string,
  ): Promise<TrackedBranch | null> {
    try {
      // Look for "branch: Created from" in reflog
      const reflog = await this.git.raw([
        "reflog",
        "show",
        branchName,
        "--format=%gs",
      ]);

      const lines = reflog.trim().split("\n");
      for (const line of lines) {
        const match = line.match(/branch: Created from (.+)$/);
        if (match && match[1] && match[1] !== "HEAD") {
          const sourceBranch = match[1];

          // Try to get upstream of the source branch
          try {
            const upstreamRef = await this.git.revparse([
              "--abbrev-ref",
              `${sourceBranch}@{upstream}`,
            ]);
            const upstreamName = upstreamRef.trim();
            if (upstreamName) {
              const commitId = await this.resolveRef(upstreamName);
              if (commitId) {
                const slashIndex = upstreamName.indexOf("/");
                return {
                  name: upstreamName,
                  displayName: upstreamName,
                  type: "base",
                  commitId,
                  remote:
                    slashIndex > 0
                      ? upstreamName.slice(0, slashIndex)
                      : undefined,
                };
              }
            }
          } catch {
            // Source branch has no upstream, try it directly if it's a remote
            if (sourceBranch.includes("/")) {
              const commitId = await this.resolveRef(sourceBranch);
              if (commitId) {
                const slashIndex = sourceBranch.indexOf("/");
                return {
                  name: sourceBranch,
                  displayName: sourceBranch,
                  type: "base",
                  commitId,
                  remote:
                    slashIndex > 0
                      ? sourceBranch.slice(0, slashIndex)
                      : undefined,
                };
              }
            }
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get the default branch (origin/main or origin/master).
   */
  private async getDefaultBranch(): Promise<TrackedBranch | null> {
    // Try origin/main first, then origin/master
    for (const branchName of ["origin/main", "origin/master"]) {
      try {
        const commitId = await this.resolveRef(branchName);
        if (commitId) {
          return {
            name: branchName,
            displayName: branchName,
            type: "base",
            commitId,
            remote: "origin",
          };
        }
      } catch {
        // Branch doesn't exist, try next
      }
    }

    return null;
  }

  /**
   * Convert git status code to GitFileStatusCode.
   */
  private statusCodeToFileStatus(code: string): GitFileStatusCode {
    switch (code) {
      case "A":
        return "added";
      case "D":
        return "deleted";
      case "M":
        return "modified";
      case "R":
        return "renamed";
      case "C":
        return "copied";
      case "U":
        return "unmerged";
      default:
        return "modified";
    }
  }

  /**
   * Revert changes to files (discard working tree modifications).
   *
   * This discards ONLY working tree changes, preserving any staged changes.
   * Mirrors VS Code's "Discard Changes" behavior.
   *
   * Handles different file types:
   * - Untracked files: Delete from filesystem
   * - All other files: Restore from index via `git checkout -- file`
   *   - If file has staged changes, reverts to staged version
   *   - If file has no staged changes, reverts to HEAD
   *
   * Note: Does NOT unstage files. Use unstage() separately if needed.
   */
  async revert(files: string[]): Promise<void> {
    await this.withOperationTracking(async () => {
      const relativePaths = files.map((f) => this.toRelativePath(f));

      // Get current status to determine how to handle each file
      const status = await this.getStatus();

      // Categorize files by revert strategy
      const filesToCheckout: string[] = [];
      const filesToDelete: string[] = [];

      for (const relPath of relativePaths) {
        const fileStatus = status.files.get(relPath);
        if (fileStatus?.status === "untracked") {
          // Only truly untracked files should be deleted
          // (files with no committed or staged version)
          filesToDelete.push(relPath);
        } else {
          // All other files (including "added") can be restored via git checkout
          // - "added" files revert to their staged version
          // - "modified" files revert to index (staged) or HEAD
          filesToCheckout.push(relPath);
        }
      }

      // Delete untracked files from filesystem
      await Promise.all(
        filesToDelete.map(async (relPath) => {
          const fullPath = path.join(this.gitRoot, relPath);
          try {
            await fsPromises.unlink(fullPath);
          } catch {
            // Ignore errors (file might already be deleted)
          }
        }),
      );

      // Restore tracked/staged files via git checkout
      // This restores working tree to match INDEX (not HEAD!)
      // - If file has staged changes: reverts to staged version
      // - If file has no staged changes: reverts to HEAD
      if (filesToCheckout.length > 0) {
        await this.git.checkout(["--", ...filesToCheckout]);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Operations
  // -------------------------------------------------------------------------

  /**
   * Stage files for commit.
   */
  async stage(files: string[]): Promise<void> {
    await this.withOperationTracking(async () => {
      const relativePaths = files.map((f) => this.toRelativePath(f));
      await this.git.add(relativePaths);
    });
  }

  /**
   * Unstage files (remove from index).
   */
  async unstage(files: string[]): Promise<void> {
    await this.withOperationTracking(async () => {
      const relativePaths = files.map((f) => this.toRelativePath(f));
      await this.git.reset(["HEAD", "--", ...relativePaths]);
    });
  }

  /**
   * Create a commit.
   */
  async commit(
    message: string,
    options?: GitCommitOptions,
  ): Promise<GitCommit> {
    return this.withOperationTracking(async () => {
      // Build commit options object (simple-git Options type uses null for flags)
      const commitOpts: Record<string, null> = {};

      if (options?.amend) {
        commitOpts["--amend"] = null;
      }

      if (options?.signoff) {
        commitOpts["--signoff"] = null;
      }

      // Commit specific files or all staged
      if (options?.files && options.files.length > 0) {
        const relativePaths = options.files.map((f) => this.toRelativePath(f));
        await this.git.commit(message, relativePaths, commitOpts);
      } else {
        await this.git.commit(message, commitOpts);
      }

      // Get the created commit
      const log = await this.git.log({ maxCount: 1 });
      const latestCommit = log.latest;

      if (!latestCommit) {
        throw new Error("Failed to get commit after creation");
      }

      const commit: GitCommit = {
        hash: latestCommit.hash,
        shortHash: latestCommit.hash.substring(0, 7),
        author: latestCommit.author_name,
        email: latestCommit.author_email,
        date: new Date(latestCommit.date),
        message: latestCommit.message,
        parents: latestCommit.refs ? latestCommit.refs.split(", ") : [],
      };

      // Fire commit created event
      this._onCommitCreated.fire({ commit });

      return commit;
    });
  }

  /**
   * Checkout a branch or ref.
   *
   * @param ref - Branch name, tag, or commit hash
   * @param options - Checkout options (force)
   */
  async checkout(ref: string, options?: GitCheckoutOptions): Promise<void> {
    const previousBranch = await this.getCurrentBranch();
    const previousHead = await this.getHeadCommit();

    await this.withOperationTracking(async () => {
      const checkoutOptions: string[] = [];

      if (options?.force) {
        checkoutOptions.push("--force");
      }

      if (checkoutOptions.length > 0) {
        await this.git.checkout([...checkoutOptions, ref]);
      } else {
        await this.git.checkout(ref);
      }
    });

    // Check for branch/head changes
    const currentBranch = await this.getCurrentBranch();
    const currentHead = await this.getHeadCommit();

    if (previousBranch !== currentBranch) {
      this._onBranchChanged.fire({
        previousBranch,
        currentBranch,
      });
    }

    if (previousHead !== currentHead) {
      this._onHeadChanged.fire({
        previousHead,
        currentHead,
        isBranchSwitch: previousBranch !== currentBranch,
      });
    }
  }

  /**
   * Create a new branch and optionally switch to it.
   *
   * @param branchName - Name for the new branch
   * @param checkout - Whether to switch to the new branch (default: true)
   * @param startPoint - Optional ref to start the branch from (default: HEAD)
   */
  async createBranch(
    branchName: string,
    checkout = true,
    startPoint?: string,
  ): Promise<void> {
    const previousBranch = await this.getCurrentBranch();

    await this.withOperationTracking(async () => {
      if (checkout) {
        // Create and checkout in one command: git checkout -b <branch> [startPoint]
        const args = ["-b", branchName];
        if (startPoint) {
          args.push(startPoint);
        }
        await this.git.checkout(args);
      } else {
        // Just create the branch: git branch <branch> [startPoint]
        const args = [branchName];
        if (startPoint) {
          args.push(startPoint);
        }
        await this.git.branch(args);
      }
    });

    // Fire branch changed event if we switched
    if (checkout) {
      const currentBranch = await this.getCurrentBranch();
      if (previousBranch !== currentBranch) {
        this._onBranchChanged.fire({
          previousBranch,
          currentBranch,
        });
      }
    }
  }

  /**
   * Stash current uncommitted changes.
   *
   * Saves both staged and unstaged changes to the stash.
   *
   * @param message - Optional message for the stash entry
   */
  async stash(message?: string): Promise<void> {
    await this.withOperationTracking(async () => {
      if (message) {
        await this.git.stash(["push", "-m", message]);
      } else {
        await this.git.stash(["push"]);
      }
    });
  }

  /**
   * Apply and remove the most recent stash entry.
   *
   * Restores the previously stashed changes to the working directory.
   */
  async stashPop(): Promise<void> {
    await this.withOperationTracking(async () => {
      await this.git.stash(["pop"]);
    });
  }

  /**
   * Push commits to remote.
   *
   * @param force - If true, use --force-with-lease for safer force push
   * @param setUpstream - If true, set upstream tracking (for new branches)
   */
  async push(force = false, setUpstream = false): Promise<void> {
    await this.withOperationTracking(async () => {
      const options: string[] = [];

      if (force) {
        options.push("--force-with-lease");
      }

      if (setUpstream) {
        // Push with --set-upstream to create/track remote branch
        options.push("--set-upstream", "origin", "HEAD");
      }

      await this.git.push(options);
    });
  }

  /**
   * Pull changes from remote.
   *
   * @param rebase - If true, use rebase instead of merge
   */
  async pull(rebase = false): Promise<void> {
    await this.withOperationTracking(async () => {
      if (rebase) {
        await this.git.pull(["--rebase"]);
      } else {
        await this.git.pull();
      }
    });
  }

  /**
   * Check if the current branch has an upstream (tracking) branch configured.
   *
   * @returns true if an upstream is configured, false otherwise
   */
  async hasUpstream(): Promise<boolean> {
    try {
      // Use rev-parse to check for upstream ref
      // This will fail if no upstream is set
      const result = await this.git.raw([
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{u}",
      ]);
      return result.trim().length > 0;
    } catch {
      // Command fails if no upstream is set
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Internal: State Management
  // -------------------------------------------------------------------------

  /**
   * Initialize last known state for change detection.
   */
  private async initializeState(): Promise<void> {
    try {
      this.lastStatus = await this.getStatus();
      this.lastBranch = await this.getCurrentBranch();
      this.lastHead = await this.getHeadCommit();
    } catch (error) {
      console.error("[DiskGitProvider] Failed to initialize state:", error);
    }
  }

  /**
   * Get the current HEAD commit hash.
   */
  private async getHeadCommit(): Promise<string> {
    try {
      const result = await this.git.revparse(["HEAD"]);
      return result.trim();
    } catch {
      return "";
    }
  }

  // -------------------------------------------------------------------------
  // Internal: Status Parsing
  // -------------------------------------------------------------------------

  /**
   * Parse git status result into our GitStatus type.
   */
  private parseStatus(statusResult: StatusResult, branch: string): GitStatus {
    const files = new Map<string, GitFileStatus>();

    // Process all file statuses
    for (const file of statusResult.files) {
      const entries = this.parseFileStatuses(file);
      for (const entry of entries) {
        // For partially staged files, we have two entries:
        // - Staged entry uses the path as key (backward compatible)
        // - Unstaged entry uses path + suffix to avoid key collision
        const key =
          entry.staged || !entry.hasIndexChanges
            ? entry.path
            : entry.path + UNSTAGED_KEY_SUFFIX;
        files.set(key, entry);
      }
    }

    return {
      branch: branch || "HEAD",
      upstream: statusResult.tracking || undefined,
      ahead: statusResult.ahead,
      behind: statusResult.behind,
      files,
    };
  }

  /**
   * Parse a single file from simple-git into one or two GitFileStatus entries.
   *
   * For most files, returns a single entry. For partially staged files
   * (e.g., "MM" - modified in both index and working directory), returns
   * two entries: one for staged changes and one for unstaged changes.
   */
  private parseFileStatuses(file: {
    path: string;
    index: string;
    working_dir: string;
  }): GitFileStatus[] {
    const { path: filePath, index, working_dir } = file;
    const entries: GitFileStatus[] = [];

    // Handle special cases first
    // Untracked files
    if (index === "?" && working_dir === "?") {
      entries.push({
        path: filePath,
        status: "untracked",
        staged: false,
      });
      return entries;
    }

    // Ignored files
    if (index === "!" && working_dir === "!") {
      entries.push({
        path: filePath,
        status: "ignored",
        staged: false,
      });
      return entries;
    }

    // Unmerged (conflict)
    if (
      index === "U" ||
      working_dir === "U" ||
      (index === "A" && working_dir === "A") ||
      (index === "D" && working_dir === "D")
    ) {
      entries.push({
        path: filePath,
        status: "unmerged",
        staged: false,
      });
      return entries;
    }

    // Check if file has changes in index (staged area)
    const hasIndexChange = index !== " " && index !== "?";
    // Check if file has changes in working directory (unstaged)
    const hasWorkingDirChange = working_dir !== " " && working_dir !== "?";

    // Create staged entry if there are index changes
    if (hasIndexChange) {
      entries.push({
        path: filePath,
        status: this.codeToStatus(index),
        staged: true,
        hasIndexChanges: true,
      });
    }

    // Create unstaged entry if there are working directory changes
    if (hasWorkingDirChange) {
      entries.push({
        path: filePath,
        status: this.codeToStatus(working_dir),
        staged: false,
        // hasIndexChanges indicates the diff should be Index → Working Dir
        // instead of HEAD → Working Dir
        hasIndexChanges: hasIndexChange,
      });
    }

    return entries;
  }

  /**
   * Interpret git status codes (index and working directory).
   *
   * Git status uses two columns:
   * - Index (staged): What's staged for commit
   * - Working directory: What's changed but not staged
   *
   * Common patterns:
   * - "M " = Modified and staged
   * - " M" = Modified but not staged
   * - "MM" = Modified, staged, then modified again (partially staged)
   * - "A " = Added (new file, staged)
   * - "??" = Untracked
   * - " D" = Deleted but not staged
   * - "D " = Deleted and staged
   *
   * @deprecated Use parseFileStatuses instead which handles partially staged files
   */
  private interpretStatusCodes(
    index: string,
    workingDir: string,
  ): { status: GitFileStatusCode | null; staged: boolean } {
    // Untracked files
    if (index === "?" && workingDir === "?") {
      return { status: "untracked", staged: false };
    }

    // Ignored files
    if (index === "!" && workingDir === "!") {
      return { status: "ignored", staged: false };
    }

    // Unmerged (conflict)
    if (
      index === "U" ||
      workingDir === "U" ||
      (index === "A" && workingDir === "A") ||
      (index === "D" && workingDir === "D")
    ) {
      return { status: "unmerged", staged: false };
    }

    // Staged changes take priority for status code
    if (index !== " " && index !== "?") {
      const status = this.codeToStatus(index);
      return { status, staged: true };
    }

    // Working directory changes (not staged)
    if (workingDir !== " " && workingDir !== "?") {
      const status = this.codeToStatus(workingDir);
      return { status, staged: false };
    }

    return { status: null, staged: false };
  }

  /**
   * Convert a single git status code to our status type.
   */
  private codeToStatus(code: string): GitFileStatusCode {
    switch (code) {
      case "M":
        return "modified";
      case "A":
        return "added";
      case "D":
        return "deleted";
      case "R":
        return "renamed";
      case "C":
        return "copied";
      default:
        return "modified";
    }
  }

  // -------------------------------------------------------------------------
  // Internal: Refresh Scheduling
  // -------------------------------------------------------------------------

  /**
   * Schedule a status refresh with debouncing.
   */
  private scheduleStatusRefresh(): void {
    if (this.disposed || this.activeOperations > 0) {
      return;
    }

    // Clear existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    // Schedule new refresh
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refreshStatus();
    }, STATUS_REFRESH_DEBOUNCE_MS);
  }

  /**
   * Actually refresh status and emit events if changed.
   */
  private async refreshStatus(): Promise<void> {
    if (this.disposed) {
      return;
    }

    // Invalidate diff stats cache - status change means stats may have changed
    this.perFileDiffStatsCache = null;

    try {
      const currentStatus = await this.getStatus();
      const currentBranch = currentStatus.branch;
      const currentHead = await this.getHeadCommit();

      // Check for status changes
      if (this.lastStatus) {
        const delta = this.calculateStatusDelta(this.lastStatus, currentStatus);

        if (
          delta.added.length > 0 ||
          delta.modified.length > 0 ||
          delta.removed.length > 0
        ) {
          this._onStatusChanged.fire({
            status: currentStatus,
            ...delta,
          });
        }
      }

      // Check for branch changes
      if (this.lastBranch && this.lastBranch !== currentBranch) {
        this._onBranchChanged.fire({
          previousBranch: this.lastBranch,
          currentBranch,
        });
      }

      // Check for HEAD changes
      if (this.lastHead && this.lastHead !== currentHead) {
        this._onHeadChanged.fire({
          previousHead: this.lastHead,
          currentHead,
          isBranchSwitch: this.lastBranch !== currentBranch,
        });
      }

      // Update last known state
      this.lastStatus = currentStatus;
      this.lastBranch = currentBranch;
      this.lastHead = currentHead;
    } catch (error) {
      console.error("[DiskGitProvider] Failed to refresh status:", error);
    }
  }

  /**
   * Calculate the delta between two status snapshots.
   */
  private calculateStatusDelta(
    previous: GitStatus,
    current: GitStatus,
  ): { added: string[]; modified: string[]; removed: string[] } {
    const added: string[] = [];
    const modified: string[] = [];
    const removed: string[] = [];

    // Find added and modified files
    for (const [filePath, currentFile] of current.files) {
      const previousFile = previous.files.get(filePath);

      if (!previousFile) {
        added.push(filePath);
      } else if (
        previousFile.status !== currentFile.status ||
        previousFile.staged !== currentFile.staged
      ) {
        modified.push(filePath);
      }
    }

    // Find removed files
    for (const filePath of previous.files.keys()) {
      if (!current.files.has(filePath)) {
        removed.push(filePath);
      }
    }

    return { added, modified, removed };
  }

  // -------------------------------------------------------------------------
  // Internal: Operation Tracking
  // -------------------------------------------------------------------------

  /**
   * Execute a git operation with tracking.
   *
   * While operations are active, status refresh is suppressed
   * to avoid thrashing.
   */
  private async withOperationTracking<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    this.activeOperations++;

    try {
      return await operation();
    } finally {
      this.activeOperations--;

      // Schedule refresh after operation completes
      if (this.activeOperations === 0) {
        this.scheduleStatusRefresh();
      }
    }
  }

  // -------------------------------------------------------------------------
  // Internal: Path Utilities
  // -------------------------------------------------------------------------

  /**
   * Convert a path to be relative to the git root.
   *
   * On case-insensitive filesystems (macOS, Windows), handles the case where
   * the file path and git root have different casings but refer to the same location.
   *
   * Always returns paths with forward slashes for Git compatibility.
   */
  private toRelativePath(filePath: string): string {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.cwd, filePath);

    // On case-insensitive filesystems, path.relative() can produce incorrect results
    // if the paths have different casings (e.g., /Project/Other vs /Project/other).
    // We detect this by checking if the relative path tries to escape the git root.
    let relativePath = path.relative(this.gitRoot, absolutePath);

    // If the result starts with "..", the paths might have different casings
    if (
      relativePath.startsWith("..") &&
      (process.platform === "darwin" || process.platform === "win32")
    ) {
      // Try case-insensitive comparison
      const gitRootLower = this.gitRoot.toLowerCase();
      const absolutePathLower = absolutePath.toLowerCase();

      if (absolutePathLower.startsWith(gitRootLower)) {
        // The file IS inside the git root, just with different casing
        // Extract the relative portion using the lowercase match
        const relativePortion = absolutePath.slice(this.gitRoot.length);
        // Remove leading slash if present
        relativePath = relativePortion.replace(/^[/\\]/, "");
      }
    }

    // Convert to forward slashes for Git compatibility
    return relativePath.split(path.sep).join("/");
  }

  /**
   * Resolve the actual .git directory for worktrees.
   *
   * When using git worktrees, .git is a file containing:
   * "gitdir: /path/to/actual/.git/worktrees/name"
   */
  private resolveGitDir(gitFile: string): string {
    try {
      const content = fs.readFileSync(gitFile, "utf8");
      const match = content.match(/gitdir:\s*(.+)/);
      if (match) {
        const gitDir = match[1].trim();
        return path.isAbsolute(gitDir)
          ? gitDir
          : path.resolve(path.dirname(gitFile), gitDir);
      }
    } catch {
      // Fall back to the file path itself
    }
    return gitFile;
  }
}
