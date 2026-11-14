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
 * - Real-time updates from the shared git status
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
 * />
 * ```
 */

import { gitMutations, gitQueries } from "@features/git/client/queries";
import type { GitFileStatus } from "@features/git/model";
import type { GitSubscription } from "@features/git/client/GitSubscription";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, GitCommit, Minus } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  DISABLED_UNSEEN_TRACKING,
  type UnseenTrackingResult,
  useGitSync,
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
  git: GitSubscription;

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
  unseenTracking: unseenTrackingProp,
  isFileDirty,
}: ReviewWorkingPaneProps) {
  // Ref for the scrollable container
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // ---------------------------------------------------------------------------
  // Git Status State
  // ---------------------------------------------------------------------------

  const { data: gitStatus = null, isPending: isLoading } = useQuery(
    gitQueries.status(git),
  );

  // ---------------------------------------------------------------------------
  // Commit State
  // ---------------------------------------------------------------------------

  const [commitMessage, setCommitMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const gitSync = useGitSync(git);
  const { mutate: commit } = useMutation(gitMutations.commit(git.cwd));
  const { mutate: stage } = useMutation(gitMutations.stage(git.cwd));
  const { mutate: unstage } = useMutation(gitMutations.unstage(git.cwd));

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
  // This component just uses the tracking state
  const {
    isUnseen,
    getTimestamp,
    markSeen,
    markAllSeen,
    getUnseenCount,
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
  // Handlers: Commit
  // ---------------------------------------------------------------------------

  const handleCommit = useCallback(() => {
    const message = commitMessage.trim();
    if (!message || stagedFiles.length === 0) {
      return;
    }

    setError(null);
    commit(message, {
      onSuccess: () => setCommitMessage(""),
      onError: (err) => setError(`Failed to commit: ${err.message}`),
    });
  }, [commit, commitMessage, stagedFiles.length]);

  // ---------------------------------------------------------------------------
  // Handlers: Bulk Stage/Unstage
  // ---------------------------------------------------------------------------

  const handleStageAll = useCallback(() => {
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
    stage(paths, {
      onError: (err) => setError(`Failed to stage files: ${err.message}`),
    });
  }, [stage, cwd, unstagedFiles, isFileDirty]);

  const handleUnstageAll = useCallback(() => {
    const paths = stagedFiles.map(([path]) => path);
    if (paths.length === 0) return;

    unstage(paths, {
      onError: (err) => setError(`Failed to unstage files: ${err.message}`),
    });
  }, [unstage, stagedFiles]);

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
  // Render
  // ---------------------------------------------------------------------------

  const hasChanges = stagedFiles.length > 0 || unstagedFiles.length > 0;

  const canCommit =
    commitMessage.trim().length > 0 &&
    stagedFiles.length > 0 &&
    !gitSync.isCommitting;

  const totalCount = stagedFiles.length + unstagedFiles.length;

  // The header stays while loading and once everything is committed, so a
  // narrow pane can always exit and push
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
        isCommitting={gitSync.isCommitting}
        stagedCount={stagedFiles.length}
        onPull={gitSync.pull}
        onPush={gitSync.push}
        isPulling={gitSync.isPulling}
        isPushing={gitSync.isPushing}
        hasUpstream={gitSync.hasUpstream}
        onExitReview={onExitReview}
        error={error}
        onDismissError={handleDismissError}
        // Sort order props
        sortByLastEdited={sortByLastEdited}
        onToggleSortOrder={toggleSortOrder}
        // Unseen tracking props (always active). Tracking keeps files that
        // have left the changes, like committed ones, so only these count.
        unseenCount={stagedUnseenCount + unstagedUnseenCount}
        onMarkAllSeen={markAllSeen}
      />

      {isLoading ? (
        <div
          className="flex flex-1 items-center justify-center text-muted-foreground text-sm"
          data-testid="changes-review-pane-loading"
        >
          Loading changes...
        </div>
      ) : !hasChanges ? (
        <div
          className="flex flex-1 flex-col items-center justify-center text-muted-foreground text-sm gap-2"
          data-testid="changes-review-pane-empty"
        >
          <GitCommit className="w-8 h-8 opacity-50" />
          <span>No changes to review</span>
        </div>
      ) : (
        <>
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
              markSeen={markSeen}
            />

            {/* Unstaged Changes Section */}
            <ReviewWorkingPaneSection
              title="Changes"
              files={sortedUnstagedFiles}
              icon={<Minus className="w-3.5 h-3.5" />}
              iconColorClass="text-yellow-500"
              isExpanded={unstagedSectionExpanded}
              onToggle={() =>
                setUnstagedSectionExpanded(!unstagedSectionExpanded)
              }
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
              markSeen={markSeen}
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
        </>
      )}
    </div>
  );
}
