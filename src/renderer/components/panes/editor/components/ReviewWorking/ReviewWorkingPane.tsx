/**
 * ReviewWorkingPane - Multi-file working tree changes review with inline diffs.
 *
 * Displays all changed files in a scrollable list, each with:
 * - Collapsible header showing file path and status
 * - Inline diff view when expanded
 * - Stage/unstage/revert actions
 *
 * Also includes:
 * - Commit controls header (message input, commit/push/pull buttons)
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
 * <ReviewWorkingPane
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

import type { GitFileStatus, GitStatus } from "@/api/GitV2API";
import type { GitV2API } from "@/api/GitV2API";
import { Check, GitCommit, Minus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DISABLED_UNSEEN_TRACKING,
  type UnseenTrackingResult,
} from "../../hooks";
import {
  filterDirtyFilesForStaging,
  joinCwdPath,
  notifyDirtyFilesSkipped,
} from "../../utils";
import { ReviewWorkingPaneFooter } from "./ReviewWorkingPaneFooter";
import { ReviewWorkingPaneHeader } from "./ReviewWorkingPaneHeader";
import { ReviewWorkingPaneSection } from "./ReviewWorkingPaneSection";
import { useExpandedFiles, useScrollToSelectedFile } from "./hooks";

export interface ReviewWorkingPaneProps {
  /** Working directory */
  cwd: string;

  /** Git API instance (shared from parent) */
  git: GitV2API;

  /** Git ref for original content comparison (default: 'HEAD') */
  baseBranch?: string;

  /** Callback to exit review mode (optional) */
  onExitReview?: () => void;

  /** Selected file path from tree (relative path) - will expand and scroll to this file */
  selectedFilePath?: string;

  /**
   * Selected map key from tree - used for scrolling to correct entry.
   * For partially staged files, this distinguishes between staged and unstaged entries.
   * The key matches the git status Map key (includes UNSTAGED_KEY_SUFFIX for unstaged entries).
   */
  selectedMapKey?: string | null;

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

  /** Unseen tracking state and functions (shared from EditorPaneV2) */
  unseenTracking?: UnseenTrackingResult;

  // ---------------------------------------------------------------------------
  // Dirty File Checking
  // ---------------------------------------------------------------------------

  /** Check if a file has unsaved changes - used to prevent staging dirty files */
  isFileDirty?: (filePath: string) => boolean;
}

/**
 * Multi-file changes review pane with inline diffs and commit UI.
 */
export function ReviewWorkingPane({
  cwd,
  git,
  baseBranch,
  onExitReview,
  selectedFilePath,
  selectedMapKey,
  hasUpstream,
  isPulling,
  isPushing,
  onPull,
  onPush,
  unseenTracking: unseenTrackingProp,
  isFileDirty,
}: ReviewWorkingPaneProps) {
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

  const { stagedFiles, unstagedFiles, allFilePaths } = useMemo((): {
    stagedFiles: Array<[string, GitFileStatus]>;
    unstagedFiles: Array<[string, GitFileStatus]>;
    allFilePaths: string[];
  } => {
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
  // Unseen Tracking (from parent EditorPaneV2)
  // ---------------------------------------------------------------------------

  // Subscriptions are handled by useUnseenTracking in EditorPaneV2
  // This component just uses the tracking state and triggerRead function
  const {
    isUnseen,
    getTimestamp,
    triggerRead,
    markAllSeen,
    getUnseenCount,
    unseenCount,
    sortByTimestamp,
  } = unseenTrackingProp ?? DISABLED_UNSEEN_TRACKING;

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
    selectedMapKey: selectedMapKey ?? undefined,
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
  // Git Status Subscription
  // ---------------------------------------------------------------------------

  // Subscribe to git status changes to keep our local status in sync
  // Note: Unseen tracking subscriptions are handled by useUnseenTracking in EditorPaneV2
  useEffect(() => {
    const cleanup = git.onStatusChanged((event) => {
      setGitStatus(event.status);
    });
    return cleanup;
  }, [git]);

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
    if (unstagedFiles.length === 0) return;

    // Filter out dirty files (files with unsaved changes in editor)
    const { cleanFiles, allDirty, skippedCount } = filterDirtyFilesForStaging(
      unstagedFiles,
      ([, status]) => joinCwdPath(cwd, status.path),
      isFileDirty,
    );

    // Show notification if any files were skipped
    notifyDirtyFilesSkipped(skippedCount, allDirty);

    if (allDirty) return;

    const paths = cleanFiles.map(([, status]) => status.path);

    try {
      await git.stage(paths);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(`Failed to stage files: ${errorMessage}`);
      console.error("Failed to stage files:", err);
    }
  }, [git, cwd, unstagedFiles, isFileDirty]);

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
      <ReviewWorkingPaneHeader
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
        <ReviewWorkingPaneSection
          title="Staged Changes"
          files={sortedStagedFiles}
          icon={<Check className="w-3.5 h-3.5" />}
          iconColorClass="text-green-500"
          isExpanded={stagedSectionExpanded}
          onToggle={() => setStagedSectionExpanded(!stagedSectionExpanded)}
          bulkActionLabel="Unstage all"
          onBulkAction={handleUnstageAll}
          cwd={cwd}
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
          triggerRead={triggerRead}
        />

        {/* Unstaged Changes Section */}
        <ReviewWorkingPaneSection
          title="Changes"
          files={sortedUnstagedFiles}
          icon={<Minus className="w-3.5 h-3.5" />}
          iconColorClass="text-yellow-500"
          isExpanded={unstagedSectionExpanded}
          onToggle={() => setUnstagedSectionExpanded(!unstagedSectionExpanded)}
          bulkActionLabel="Stage all"
          onBulkAction={handleStageAll}
          cwd={cwd}
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
          triggerRead={triggerRead}
          // Dirty file checking (for preventing staging unsaved files)
          isFileDirty={isFileDirty}
        />
      </div>

      {/* Summary Footer */}
      <ReviewWorkingPaneFooter
        stagedCount={stagedFiles.length}
        unstagedCount={unstagedFiles.length}
        totalCount={totalCount}
      />
    </div>
  );
}
