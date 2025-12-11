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
 * />
 * ```
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { GitCommit, Check, Minus } from "lucide-react";
import type { GitFileStatus, GitStatus } from "@/../../src/ipc/gitv2/types";
import type { GitV2API } from "@/api/GitV2API";
import { ChangesReviewToolbar } from "./ChangesReviewToolbar";
import { ChangesSection } from "./ChangesSection";
import { ChangesFooter } from "./ChangesFooter";
import { useExpandedFiles, useScrollToSelectedFile } from "./hooks";

export interface ChangesReviewPaneProps {
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
}

/**
 * Multi-file changes review pane with inline diffs and commit UI.
 */
export function ChangesReviewPane({
  cwd,
  git,
  baseBranch,
  onExitReview,
  selectedFilePath,
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
  // Pull/Push State
  // ---------------------------------------------------------------------------

  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [hasUpstream, setHasUpstream] = useState(true);

  // ---------------------------------------------------------------------------
  // Section Expansion State
  // ---------------------------------------------------------------------------

  const [stagedSectionExpanded, setStagedSectionExpanded] = useState(true);
  const [unstagedSectionExpanded, setUnstagedSectionExpanded] = useState(true);

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
  const { expandedFiles, toggleFile, expandFile } = useExpandedFiles(
    allFilePaths,
    true,
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

        // Check if upstream is configured
        try {
          const branchInfo = await git.getBranches();
          if (!cancelled && branchInfo.current) {
            setHasUpstream(branchInfo.current.upstream !== null);
          }
        } catch {
          // Ignore branch info errors
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
  // Handlers: Pull/Push
  // ---------------------------------------------------------------------------

  const handlePull = useCallback(async () => {
    setIsPulling(true);
    setError(null);

    try {
      await git.pull();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(`Failed to pull: ${errorMessage}`);
      console.error("Failed to pull:", err);
    } finally {
      setIsPulling(false);
    }
  }, [git]);

  const handlePush = useCallback(async () => {
    setIsPushing(true);
    setError(null);

    try {
      await git.push();
      // If push succeeds, we now have an upstream
      setHasUpstream(true);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(`Failed to push: ${errorMessage}`);
      console.error("Failed to push:", err);
    } finally {
      setIsPushing(false);
    }
  }, [git]);

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
        onPull={handlePull}
        onPush={handlePush}
        isPulling={isPulling}
        isPushing={isPushing}
        hasUpstream={hasUpstream}
        onExitReview={onExitReview}
        error={error}
        onDismissError={handleDismissError}
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
          files={stagedFiles}
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
        />

        {/* Unstaged Changes Section */}
        <ChangesSection
          title="Changes"
          files={unstagedFiles}
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
