/**
 * CommitGraphPanel Component
 *
 * Main container for the commit graph feature.
 * This is the top-level component that integrates all commit graph functionality.
 *
 * Features:
 * - Fetches and displays commit history with graph visualization
 * - Handles loading, error, and empty states
 * - Supports commit expansion to view files
 * - Provides refresh and load more functionality
 * - Keyboard navigation for commit list
 *
 * Layout:
 * ```
 * ┌─────────────────────────────────────────┐
 * │ Commits                            [⟳] │ <- Header
 * ├─────────────────────────────────────────┤
 * │ ○ Fix auth bug                          │
 * │ │ 2h ago · John · abc123                │
 * │─│─────────────────────────────────────── │
 * │ ○ Add feature                           │
 * │   1d ago · Jane · def456                │
 * ├─────────────────────────────────────────┤
 * │        [ Load More ]                    │
 * └─────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <CommitGraphPanel
 *   git={gitApi}
 *   headCommitId={currentHead}
 *   onFileSelect={({ file, commitId, parentCommitId }) => {
 *     // Open diff view for file
 *   }}
 *   onViewCommit={({ commitId, parentCommitId, commit }) => {
 *     // Open commit review pane
 *   }}
 * />
 * ```
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/utils";
import type { GitV2API } from "@/api/GitV2API";
import type {
  CommitFile,
  CommitFileSelectEvent,
  CommitViewEvent,
} from "./types";
import { useCommitGraph } from "./hooks";
import { CommitGraphHeader } from "./CommitGraphHeader";
import { CommitGraphList } from "./CommitGraphList";
import { LoadingState, ErrorState, EmptyState } from "./states";

// =============================================================================
// Types
// =============================================================================

export interface CommitGraphPanelProps {
  /** Git API instance for fetching data */
  git: GitV2API;

  /**
   * Current HEAD commit ID.
   * Used to mark HEAD commits in the graph.
   */
  headCommitId?: string;

  /**
   * Number of commits to load per page.
   * @default 50
   */
  pageSize?: number;

  /**
   * Called when a file is selected within an expanded commit.
   */
  onFileSelect?: (event: CommitFileSelectEvent) => void;

  /**
   * Called when "view all" is clicked on a commit.
   */
  onViewCommit?: (event: CommitViewEvent) => void;

  /** Optional additional class names */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Main commit graph panel component.
 *
 * Integrates all commit graph functionality:
 * - Header with refresh button
 * - List of commit rows with graph visualization
 * - State handling (loading, error, empty)
 * - Keyboard navigation
 */
function CommitGraphPanelComponent({
  git,
  headCommitId,
  pageSize = 50,
  onFileSelect,
  onViewCommit,
  className,
}: CommitGraphPanelProps) {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  // Commit graph state from hook
  const {
    nodes,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    expandedCommitIds,
    trackedBranches,
    refresh,
    loadMore,
    toggleExpand,
  } = useCommitGraph(git, {
    headCommitId,
    pageSize,
  });

  // Selected commit for keyboard navigation
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);

  // Selected file path within expanded commit
  const [selectedFilePath, setSelectedFilePath] = useState<string | undefined>(
    undefined,
  );

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Track ahead/behind for push detection
  const lastAheadBehindRef = useRef<{ ahead: number; behind: number } | null>(
    null,
  );

  /**
   * Auto-refresh commit list when HEAD changes.
   *
   * This catches commits, pulls, and branch switches.
   */
  useEffect(() => {
    const cleanup = git.onHeadChanged(() => {
      refresh();
    });

    return cleanup;
  }, [git, refresh]);

  /**
   * Also refresh when ahead/behind changes (catches push).
   *
   * Push doesn't change HEAD, but it does change the ahead count.
   * We track ahead/behind to avoid refreshing on file edits.
   */
  useEffect(() => {
    const cleanup = git.onStatusChanged((event) => {
      const { ahead, behind } = event.status;
      const last = lastAheadBehindRef.current;

      // Update tracked values
      const changed =
        last !== null && (last.ahead !== ahead || last.behind !== behind);
      lastAheadBehindRef.current = { ahead, behind };

      // Only refresh if ahead/behind actually changed
      if (changed) {
        refresh();
      }
    });

    return cleanup;
  }, [git, refresh]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle refresh button click.
   */
  const handleRefresh = useCallback(() => {
    refresh();
    setSelectedCommitId(null);
    setSelectedFilePath(undefined);
  }, [refresh]);

  /**
   * Handle commit row toggle (expand/collapse).
   * Also selects the commit when clicked.
   */
  const handleToggleExpand = useCallback(
    (commitId: string) => {
      toggleExpand(commitId);
      // Select the commit when clicking on it
      setSelectedCommitId(commitId);
      // Clear file selection when toggling
      setSelectedFilePath(undefined);
    },
    [toggleExpand],
  );

  /**
   * Handle "view all" button click on a commit.
   */
  const handleViewAll = useCallback(
    (commitId: string) => {
      if (!onViewCommit) return;

      const node = nodes.find((n) => n.commit.id === commitId);
      if (!node) return;

      const parentCommitId = node.commit.parentIds[0] ?? "";

      onViewCommit({
        commitId,
        parentCommitId,
        commit: node.commit,
      });
    },
    [nodes, onViewCommit],
  );

  /**
   * Handle file selection within an expanded commit.
   */
  const handleFileSelect = useCallback(
    (file: CommitFile, commitId: string) => {
      setSelectedFilePath(file.path);

      if (!onFileSelect) return;

      const node = nodes.find((n) => n.commit.id === commitId);
      if (!node) return;

      const parentCommitId = node.commit.parentIds[0] ?? "";

      onFileSelect({
        file,
        commitId,
        parentCommitId,
      });
    },
    [nodes, onFileSelect],
  );

  /**
   * Handle selection change from keyboard navigation.
   */
  const handleSelectionChange = useCallback((commitId: string | null) => {
    setSelectedCommitId(commitId);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className={cn("flex flex-col h-full min-h-0", className)}
      data-testid="commit-graph-panel"
    >
      {/* Header */}
      <CommitGraphHeader onRefresh={handleRefresh} isRefreshing={isLoading} />

      {/* Content area - flex container for proper scroll behavior */}
      <div className="flex-1 min-h-0 flex flex-col pt-1">
        {/* Loading state (initial load only) */}
        {isLoading && nodes.length === 0 && <LoadingState />}

        {/* Error state */}
        {error && !isLoading && (
          <ErrorState error={error} onRetry={handleRefresh} />
        )}

        {/* Empty state */}
        {!isLoading && !error && nodes.length === 0 && <EmptyState />}

        {/* Commit list */}
        {!error && nodes.length > 0 && (
          <CommitGraphList
            nodes={nodes}
            expandedCommits={expandedCommitIds}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            selectedCommitId={selectedCommitId}
            selectedFilePath={selectedFilePath}
            trackedBranches={trackedBranches}
            onToggleExpand={handleToggleExpand}
            onViewAll={onViewCommit ? handleViewAll : undefined}
            onFileSelect={onFileSelect ? handleFileSelect : undefined}
            onLoadMore={loadMore}
            onSelectionChange={handleSelectionChange}
            className="flex-1 min-h-0"
          />
        )}
      </div>
    </div>
  );
}

export const CommitGraphPanel = memo(CommitGraphPanelComponent);

export default CommitGraphPanel;
