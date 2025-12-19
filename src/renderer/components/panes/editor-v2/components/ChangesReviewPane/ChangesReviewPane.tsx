/**
 * ChangesReviewPane - Multi-file changes review with inline diffs.
 *
 * Displays all changed files in a scrollable list, each with:
 * - Collapsible header showing file path and status
 * - Inline diff view when expanded
 * - Stage/unstage/revert actions
 *
 * Also includes:
 * - Commit controls toolbar (message input, commit/push/pull buttons)
 * - Expand/collapse all controls
 * - Staged and unstaged sections with bulk actions
 * - Summary footer with file counts
 * - Real-time updates via git status subscription
 *
 * This is an alternative to the file tree + single file view,
 * useful for reviewing all changes before committing.
 *
 * @example
 * ```tsx
 * <ChangesReviewPane
 *   cwd="/project"
 *   git={git}
 *   baseBranch="main"
 *   onExitReview={() => setViewMode({ type: 'editor' })}
 *   hasUpstream={hasUpstream}
 *   isPulling={isPulling}
 *   isPushing={isPushing}
 *   onPull={handlePull}
 *   onPush={handlePush}
 * />
 * ```
 */

import type { GitFileStatus, GitStatus } from "@/../../src/ipc/gitv2/types";
import type { GitV2API } from "@/api/GitV2API";
import { FileSystemV2APIService } from "@/services/FileSystemV2APIService";
import { Check, GitCommit, Minus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DISABLED_TRACKING, type FileChangeTrackingResult } from "../../hooks";
import { ChangesFooter } from "./ChangesFooter";
import { ChangesReviewToolbar } from "./ChangesReviewToolbar";
import { ChangesSection } from "./ChangesSection";
import { useExpandedFiles, useScrollToSelectedFile } from "./hooks";

export interface ChangesReviewPaneProps {
  /** Working directory */
  cwd: string;

  /** Optional sandbox ID for cloud VM operations */
  sandboxId?: string;

  /** Git API instance (shared from parent) */
  git: GitV2API;

  /** Git ref for original content comparison (default: 'HEAD') */
  baseBranch?: string;

  /** Callback to exit review mode (optional) */
  onExitReview?: () => void;

  /** Selected file path from tree (relative path) - will expand and scroll to this file */
  selectedFilePath?: string;

  // ---------------------------------------------------------------------------
  // Remote Operations (controlled by parent - EditorPaneV2)
  // ---------------------------------------------------------------------------

  /** Whether the current branch has an upstream tracking branch */
  hasUpstream: boolean;

  /** Whether a pull operation is in progress */
  isPulling: boolean;

  /** Whether a push operation is in progress */
  isPushing: boolean;

  /** Callback to trigger a pull operation */
  onPull: () => void;

  /** Callback to trigger a push operation */
  onPush: () => void;

  // ---------------------------------------------------------------------------
  // File Change Tracking (shared state from parent)
  // ---------------------------------------------------------------------------

  /** File change tracking state and functions (shared between file tree and review pane) */
  fileTracking?: FileChangeTrackingResult;
}

/**
 * Multi-file changes review pane with inline diffs and commit UI.
 */
export function ChangesReviewPane({
  cwd,
  sandboxId,
  git,
  baseBranch,
  onExitReview,
  selectedFilePath,
  hasUpstream,
  isPulling,
  isPushing,
  onPull,
  onPush,
  fileTracking: fileTrackingProp,
}: ChangesReviewPaneProps) {
  // Ref for the scrollable container
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // ---------------------------------------------------------------------------
  // Git Status State
  // ---------------------------------------------------------------------------

  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ---------------------------------------------------------------------------
  // Commit State
  // ---------------------------------------------------------------------------

  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Section Expansion State
  // ---------------------------------------------------------------------------

  const [stagedSectionExpanded, setStagedSectionExpanded] = useState(true);
  const [unstagedSectionExpanded, setUnstagedSectionExpanded] = useState(true);

  // ---------------------------------------------------------------------------
  // Sort Order State
  // ---------------------------------------------------------------------------

  const [sortByLastEdited, setSortByLastEdited] = useState(false);

  const toggleSortOrder = useCallback(() => {
    setSortByLastEdited((prev) => !prev);
  }, []);

  // ---------------------------------------------------------------------------
  // Computed: File Lists
  // ---------------------------------------------------------------------------

  const { stagedFiles, unstagedFiles, allFilePaths } = useMemo(() => {
    const staged: Array<[string, GitFileStatus]> = [];
    const unstaged: Array<[string, GitFileStatus]> = [];

    if (gitStatus?.files) {
      for (const [path, status] of gitStatus.files) {
        if (status.staged) {
          staged.push([path, status]);
        } else {
          unstaged.push([path, status]);
        }
      }
    }

    // Sort alphabetically by path
    staged.sort((a, b) => a[0].localeCompare(b[0]));
    unstaged.sort((a, b) => a[0].localeCompare(b[0]));

    const allPaths = [...staged, ...unstaged].map(([path]) => path);

    return {
      stagedFiles: staged,
      unstagedFiles: unstaged,
      allFilePaths: allPaths,
    };
  }, [gitStatus]);

  // ---------------------------------------------------------------------------
  // File Expansion State (via hook)
  // ---------------------------------------------------------------------------

  // Auto-expand files by default to match v1 behavior
  const { expandedFiles, toggleFile, expandFile, expandFiles, collapseFiles } =
    useExpandedFiles(allFilePaths, true);

  // ---------------------------------------------------------------------------
  // File Change Tracking State (only when fileTrackingProp is provided)
  // ---------------------------------------------------------------------------

  // When fileTrackingProp is undefined, tracking is disabled - use no-op functions
  const trackingEnabled = fileTrackingProp !== undefined;
  const {
    isUnseen,
    getTimestamp,
    markSeen,
    markAllSeen,
    getUnseenCount,
    unseenCount,
    sortByTimestamp,
    processStatusChange,
    initializeFiles,
  } = fileTrackingProp ?? DISABLED_TRACKING;

  // ---------------------------------------------------------------------------
  // Sorted File Lists (by timestamp when sortByLastEdited is true)
  // ---------------------------------------------------------------------------

  // Sort files by modification time (most recent first) when sortByLastEdited is true
  const sortedStagedFiles = useMemo(
    () => (sortByLastEdited ? sortByTimestamp(stagedFiles) : stagedFiles),
    [sortByTimestamp, stagedFiles, sortByLastEdited],
  );

  const sortedUnstagedFiles = useMemo(
    () => (sortByLastEdited ? sortByTimestamp(unstagedFiles) : unstagedFiles),
    [sortByTimestamp, unstagedFiles, sortByLastEdited],
  );

  // Get unseen counts for each section
  const stagedUnseenCount = useMemo(
    () => getUnseenCount(stagedFiles.map(([path]) => path)),
    [getUnseenCount, stagedFiles],
  );

  const unstagedUnseenCount = useMemo(
    () => getUnseenCount(unstagedFiles.map(([path]) => path)),
    [getUnseenCount, unstagedFiles],
  );

  // ---------------------------------------------------------------------------
  // Selected File Scroll & Expand (via hook)
  // ---------------------------------------------------------------------------

  useScrollToSelectedFile({
    selectedFilePath,
    scrollContainerRef,
    stagedFiles,
    unstagedFiles,
    expandFile,
    setStagedSectionExpanded,
    setUnstagedSectionExpanded,
  });

  // ---------------------------------------------------------------------------
  // Initial Load
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      setIsLoading(true);
      try {
        // Wait for git API to be ready before querying
        await git.whenReady();

        if (cancelled) return;

        const status = await git.getStatus();
        if (!cancelled) {
          setGitStatus(status);
        }
      } catch (err) {
        console.error("Failed to load git status:", err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadStatus();

    return () => {
      cancelled = true;
    };
  }, [git]);

  // ---------------------------------------------------------------------------
  // Follow Mode: Initialize Files on Initial Load
  // ---------------------------------------------------------------------------

  // Initialize Follow mode tracking for existing files (marks them as "seen")
  // Fetches actual file modification times for proper sorting
  useEffect(() => {
    if (isLoading || allFilePaths.length === 0) return;

    let cancelled = false;

    async function initWithTimestamps() {
      try {
        // Fetch actual file modification times from git
        const filesWithTimes = await git.getDirtyFilesWithTimes();

        if (cancelled) return;

        // Convert to Map for O(1) lookups
        const timestampMap = new Map<string, number>();
        for (const { path, mtime } of filesWithTimes) {
          timestampMap.set(path, mtime);
        }

        initializeFiles(allFilePaths, timestampMap);
      } catch (error) {
        console.error(
          "[ChangesReviewPane] Failed to get file timestamps:",
          error,
        );
        // Fall back to initializing without timestamps
        if (!cancelled) {
          initializeFiles(allFilePaths);
        }
      }
    }

    initWithTimestamps();

    return () => {
      cancelled = true;
    };
  }, [isLoading, allFilePaths, initializeFiles, git]);

  // ---------------------------------------------------------------------------
  // Git Status Subscription
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const cleanup = git.onStatusChanged((event) => {
      setGitStatus(event.status);

      // Process Follow mode: only mark truly NEW files as unseen (and auto-expand).
      // We intentionally ignore event.modified here because it includes staging
      // state changes (stage/unstage), which shouldn't update timestamps.
      // Actual content changes to existing files are handled by the filesystem watcher.
      if (event.added.length > 0) {
        processStatusChange(event.added, expandFile);
      }
    });

    return cleanup;
  }, [git, processStatusChange, expandFile]);

  // ---------------------------------------------------------------------------
  // External File Change Subscription (for Follow mode)
  // ---------------------------------------------------------------------------

  // Subscribe to filesystem changes to detect when files are modified.
  // This catches file edits that don't change git status (file is already "modified").
  // Works for both expanded files (with Monaco editors) and collapsed files.
  useEffect(() => {
    let fsApi: ReturnType<
      typeof FileSystemV2APIService.getInstance.acquire
    > | null = null;
    let cleanup: (() => void) | null = null;

    try {
      // Acquire a FileSystemV2API instance for our cwd
      fsApi = FileSystemV2APIService.getInstance().acquire(cwd, sandboxId);

      // Subscribe to ALL file content changes in this cwd
      cleanup = fsApi.onAnyFileContentChanged((fullPath: string) => {
        // Convert full path to relative path from cwd
        const cwdWithSlash = cwd.endsWith("/") ? cwd : cwd + "/";
        if (!fullPath.startsWith(cwdWithSlash)) return;

        const relativePath = fullPath.slice(cwdWithSlash.length);

        // Only process if it's a file we're tracking (in our git status)
        if (allFilePaths.includes(relativePath)) {
          processStatusChange([relativePath], expandFile);
        }
      });
    } catch {
      // FileSystemV2API not available (e.g., in test environment)
    }

    return () => {
      cleanup?.();
      if (fsApi) {
        // Release the FileSystemV2API instance
        FileSystemV2APIService.getInstance().release(cwd, sandboxId);
      }
    };
  }, [cwd, sandboxId, allFilePaths, processStatusChange, expandFile]);

  // ---------------------------------------------------------------------------
  // Handlers: Commit
  // ---------------------------------------------------------------------------

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim() || stagedFiles.length === 0) {
      return;
    }

    setIsCommitting(true);
    setError(null);

    try {
      await git.commit(commitMessage.trim());
      setCommitMessage("");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(`Failed to commit: ${errorMessage}`);
      console.error("Failed to commit:", err);
    } finally {
      setIsCommitting(false);
    }
  }, [git, commitMessage, stagedFiles.length]);

  // ---------------------------------------------------------------------------
  // Handlers: Bulk Stage/Unstage
  // ---------------------------------------------------------------------------

  const handleStageAll = useCallback(async () => {
    const paths = unstagedFiles.map(([path]) => path);
    if (paths.length === 0) return;

    try {
      await git.stage(paths);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(`Failed to stage files: ${errorMessage}`);
      console.error("Failed to stage files:", err);
    }
  }, [git, unstagedFiles]);

  const handleUnstageAll = useCallback(async () => {
    const paths = stagedFiles.map(([path]) => path);
    if (paths.length === 0) return;

    try {
      await git.unstage(paths);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(`Failed to unstage files: ${errorMessage}`);
      console.error("Failed to unstage files:", err);
    }
  }, [git, stagedFiles]);

  // ---------------------------------------------------------------------------
  // Handlers: Error
  // ---------------------------------------------------------------------------

  const handleDismissError = useCallback(() => {
    setError(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Section-Specific Expand/Collapse Handlers
  // ---------------------------------------------------------------------------

  const stagedFilePaths = useMemo(
    () => stagedFiles.map(([path]) => path),
    [stagedFiles],
  );
  const unstagedFilePaths = useMemo(
    () => unstagedFiles.map(([path]) => path),
    [unstagedFiles],
  );

  const handleExpandAllStaged = useCallback(() => {
    expandFiles(stagedFilePaths);
  }, [expandFiles, stagedFilePaths]);

  const handleCollapseAllStaged = useCallback(() => {
    collapseFiles(stagedFilePaths);
  }, [collapseFiles, stagedFilePaths]);

  const handleExpandAllUnstaged = useCallback(() => {
    expandFiles(unstagedFilePaths);
  }, [expandFiles, unstagedFilePaths]);

  const handleCollapseAllUnstaged = useCallback(() => {
    collapseFiles(unstagedFilePaths);
  }, [collapseFiles, unstagedFilePaths]);

  // ---------------------------------------------------------------------------
  // Render: Loading State
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center h-full text-muted-foreground text-sm"
        data-testid="changes-review-pane-loading"
      >
        Loading changes...
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Empty State
  // ---------------------------------------------------------------------------

  const hasChanges = stagedFiles.length > 0 || unstagedFiles.length > 0;

  if (!hasChanges) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2"
        data-testid="changes-review-pane-empty"
      >
        <GitCommit className="w-8 h-8 opacity-50" />
        <span>No changes to review</span>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Main Content
  // ---------------------------------------------------------------------------

  const canCommit =
    commitMessage.trim().length > 0 && stagedFiles.length > 0 && !isCommitting;

  const totalCount = stagedFiles.length + unstagedFiles.length;

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      data-testid="changes-review-pane"
    >
      {/* Toolbar with commit controls */}
      <ChangesReviewToolbar
        totalFileCount={totalCount}
        commitMessage={commitMessage}
        onCommitMessageChange={setCommitMessage}
        onCommit={handleCommit}
        canCommit={canCommit}
        isCommitting={isCommitting}
        stagedCount={stagedFiles.length}
        onPull={onPull}
        onPush={onPush}
        isPulling={isPulling}
        isPushing={isPushing}
        hasUpstream={hasUpstream}
        onExitReview={onExitReview}
        error={error}
        onDismissError={handleDismissError}
        // Sort order props
        sortByLastEdited={sortByLastEdited}
        onToggleSortOrder={toggleSortOrder}
        // Unseen tracking props (always active)
        unseenCount={unseenCount}
        onMarkAllSeen={markAllSeen}
      />

      {/* Scrollable File List */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto"
        data-testid="changes-list"
      >
        {/* Staged Changes Section */}
        <ChangesSection
          title="Staged Changes"
          files={sortedStagedFiles}
          icon={<Check className="w-3.5 h-3.5" />}
          iconColorClass="text-green-500"
          isExpanded={stagedSectionExpanded}
          onToggle={() => setStagedSectionExpanded(!stagedSectionExpanded)}
          bulkActionLabel="Unstage all"
          onBulkAction={handleUnstageAll}
          cwd={cwd}
          sandboxId={sandboxId}
          git={git}
          baseBranch={baseBranch}
          expandedFiles={expandedFiles}
          onToggleFile={toggleFile}
          onExpandAll={handleExpandAllStaged}
          onCollapseAll={handleCollapseAllStaged}
          // Unseen tracking props (always active)
          unseenCount={stagedUnseenCount}
          isFileUnseen={isUnseen}
          getFileTimestamp={sortByLastEdited ? getTimestamp : undefined}
          markFileSeen={markSeen}
        />

        {/* Unstaged Changes Section */}
        <ChangesSection
          title="Changes"
          files={sortedUnstagedFiles}
          icon={<Minus className="w-3.5 h-3.5" />}
          iconColorClass="text-yellow-500"
          isExpanded={unstagedSectionExpanded}
          onToggle={() => setUnstagedSectionExpanded(!unstagedSectionExpanded)}
          bulkActionLabel="Stage all"
          onBulkAction={handleStageAll}
          cwd={cwd}
          sandboxId={sandboxId}
          git={git}
          baseBranch={baseBranch}
          expandedFiles={expandedFiles}
          onToggleFile={toggleFile}
          onExpandAll={handleExpandAllUnstaged}
          onCollapseAll={handleCollapseAllUnstaged}
          // Unseen tracking props (always active)
          unseenCount={unstagedUnseenCount}
          isFileUnseen={isUnseen}
          getFileTimestamp={sortByLastEdited ? getTimestamp : undefined}
          markFileSeen={markSeen}
        />
      </div>

      {/* Summary Footer */}
      <ChangesFooter
        stagedCount={stagedFiles.length}
        unstagedCount={unstagedFiles.length}
        totalCount={totalCount}
      />
    </div>
  );
}
