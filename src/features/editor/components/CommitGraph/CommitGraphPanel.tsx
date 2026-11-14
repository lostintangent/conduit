/**
 * CommitGraphPanel Component
 *
 * Main container for the commit graph feature.
 * This is the top-level component that integrates all commit graph functionality.
 *
 * Features:
 * - Displays commit history with graph visualization, kept current by the
 *   git query bridge
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

import type { GitSubscription } from "@features/git/client/GitSubscription";
import { cn } from "@/utils";
import { useState } from "react";
import { CommitGraphHeader } from "./CommitGraphHeader";
import { CommitGraphList } from "./CommitGraphList";
import { useCommitGraph } from "../hooks/useCommitGraph";
import { EmptyState } from "./states/EmptyState";
import { ErrorState } from "./states/ErrorState";
import { LoadingState } from "./states/LoadingState";
import type {
  CommitFile,
  CommitFileSelectEvent,
  CommitViewEvent,
} from "./types";

// =============================================================================
// Types
// =============================================================================

export interface CommitGraphPanelProps {
  /** Git subscription for fetching data */
  git: GitSubscription;

  /**
   * Current HEAD commit ID.
   * Used to mark HEAD commits in the graph.
   */
  headCommitId?: string;

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
export function CommitGraphPanel({
  git,
  headCommitId,
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
  } = useCommitGraph(git, { headCommitId });

  // Selected commit for keyboard navigation
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);

  // Selected file path within expanded commit
  const [selectedFilePath, setSelectedFilePath] = useState<string | undefined>(
    undefined,
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle refresh button click.
   */
  const handleRefresh = () => {
    refresh();
    setSelectedCommitId(null);
    setSelectedFilePath(undefined);
  };

  /**
   * Handle commit row toggle (expand/collapse).
   * Also selects the commit when clicked.
   */
  const handleToggleExpand = (commitId: string) => {
    toggleExpand(commitId);
    // Select the commit when clicking on it
    setSelectedCommitId(commitId);
    // Clear file selection when toggling
    setSelectedFilePath(undefined);
  };

  /**
   * Handle "view all" button click on a commit.
   */
  const handleViewAll = (commitId: string) => {
    if (!onViewCommit) return;

    const node = nodes.find((n) => n.commit.id === commitId);
    if (!node) return;

    const parentCommitId = node.commit.parentIds[0] ?? "";

    onViewCommit({
      commitId,
      parentCommitId,
      commit: node.commit,
    });
  };

  /**
   * Handle file selection within an expanded commit.
   */
  const handleFileSelect = (file: CommitFile, commitId: string) => {
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
  };

  /**
   * Handle selection change from keyboard navigation.
   */
  const handleSelectionChange = (commitId: string | null) => {
    setSelectedCommitId(commitId);
  };

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
            isLoadingMore={isLoadingMore || isLoading}
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
