/**
 * CommitGraphList Component
 *
 * Renders a scrollable list of commit graph rows.
 * Handles the main commit list display with:
 * - CommitGraphRow for each node
 * - Load More button for pagination
 * - Keyboard navigation support
 * - Scroll container
 *
 * Layout:
 * ```
 * ┌─────────────────────────────────────────┐
 * │ ○ Fix auth bug                          │
 * │ │ 2h ago · John · abc123                │
 * ├─────────────────────────────────────────┤
 * │ ○ Add new feature                       │
 * │ │ 1d ago · Jane · def456                │
 * ├─────────────────────────────────────────┤
 * │        [ Load More ]                    │
 * └─────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <CommitGraphList
 *   nodes={graphNodes}
 *   expandedCommits={expandedIds}
 *   hasMore={true}
 *   isLoadingMore={false}
 *   onToggleExpand={(id) => toggleExpand(id)}
 *   onViewAll={(id) => viewCommit(id)}
 *   onFileSelect={(file, commitId) => viewDiff(file, commitId)}
 *   onLoadMore={loadMore}
 * />
 * ```
 */

import { memo, useCallback, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import type { CommitGraphNode, CommitFile, GraphRenderConfig } from "./types";
import type { TrackedBranchInfo } from "@/api/GitV2API";
import { CommitGraphRow } from "./CommitGraphRow";
import { GRAPH_CONFIG } from "./graph/constants";

// =============================================================================
// Types
// =============================================================================

export interface CommitGraphListProps {
  /** Array of commit graph nodes to display */
  nodes: CommitGraphNode[];

  /** Set of expanded commit IDs */
  expandedCommits: Set<string>;

  /** Whether more commits are available to load */
  hasMore?: boolean;

  /** Whether currently loading more commits */
  isLoadingMore?: boolean;

  /** Currently selected commit ID (for keyboard navigation) */
  selectedCommitId?: string | null;

  /** Currently selected file path within expanded panel */
  selectedFilePath?: string;

  /** Graph rendering configuration */
  config?: GraphRenderConfig;

  /** Called when a row is clicked to toggle expansion */
  onToggleExpand?: (commitId: string) => void;

  /** Called when view all button is clicked */
  onViewAll?: (commitId: string) => void;

  /** Called when a file is selected in an expanded panel */
  onFileSelect?: (file: CommitFile, commitId: string) => void;

  /** Called to load more commits */
  onLoadMore?: () => void;

  /** Called when selection changes via keyboard */
  onSelectionChange?: (commitId: string | null) => void;

  /** Tracked branch information for VS Code-style colored badges */
  trackedBranches?: TrackedBranchInfo | null;

  /** Optional additional class names */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * List container for commit graph rows.
 *
 * Features:
 * - Renders CommitGraphRow for each node
 * - Load More button at bottom for pagination
 * - Keyboard navigation support (arrow keys, Home/End)
 * - Scroll container for overflow
 */
function CommitGraphListComponent({
  nodes,
  expandedCommits,
  hasMore = false,
  isLoadingMore = false,
  selectedCommitId = null,
  selectedFilePath,
  config = GRAPH_CONFIG,
  onToggleExpand,
  onViewAll,
  onFileSelect,
  onLoadMore,
  onSelectionChange,
  trackedBranches,
  className,
}: CommitGraphListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (nodes.length === 0) return;

      const currentIndex = selectedCommitId
        ? nodes.findIndex((n) => n.commit.id === selectedCommitId)
        : -1;

      let newIndex: number | null = null;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (currentIndex === -1) {
            newIndex = 0;
          } else if (currentIndex < nodes.length - 1) {
            newIndex = currentIndex + 1;
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          if (currentIndex > 0) {
            newIndex = currentIndex - 1;
          }
          break;

        case "Home":
          e.preventDefault();
          newIndex = 0;
          break;

        case "End":
          e.preventDefault();
          newIndex = nodes.length - 1;
          break;

        case "Enter":
        case " ":
          if (selectedCommitId && !e.shiftKey) {
            e.preventDefault();
            onToggleExpand?.(selectedCommitId);
          }
          break;

        case "v":
        case "V":
          if (selectedCommitId && (e.metaKey || e.ctrlKey)) {
            // Cmd/Ctrl+V might conflict with paste, skip
          } else if (selectedCommitId) {
            e.preventDefault();
            onViewAll?.(selectedCommitId);
          }
          break;
      }

      if (newIndex !== null && newIndex >= 0 && newIndex < nodes.length) {
        const newCommitId = nodes[newIndex].commit.id;
        onSelectionChange?.(newCommitId);

        // Scroll selected row into view (with fallback for test environments)
        const rowElement = listRef.current?.querySelector(
          `[data-commit-id="${newCommitId}"]`,
        );
        if (rowElement && typeof rowElement.scrollIntoView === "function") {
          rowElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }
    },
    [nodes, selectedCommitId, onToggleExpand, onViewAll, onSelectionChange],
  );

  // Handle load more click
  const handleLoadMore = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!isLoadingMore) {
        onLoadMore?.();
      }
    },
    [isLoadingMore, onLoadMore],
  );

  // Create row handlers with commit ID context
  const createToggleHandler = useCallback(
    (commitId: string) => () => onToggleExpand?.(commitId),
    [onToggleExpand],
  );

  const createViewAllHandler = useCallback(
    (commitId: string) => () => onViewAll?.(commitId),
    [onViewAll],
  );

  const createFileSelectHandler = useCallback(
    (commitId: string) => (file: CommitFile) => onFileSelect?.(file, commitId),
    [onFileSelect],
  );

  return (
    <div
      ref={listRef}
      className={cn("flex flex-col overflow-auto px-3", className)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="listbox"
      aria-label="Commit list"
      data-testid="commit-graph-list"
    >
      {/* Commit rows */}
      {nodes.map((node) => {
        const isExpanded = expandedCommits.has(node.commit.id);
        const isSelected = selectedCommitId === node.commit.id;

        return (
          <CommitGraphRow
            key={node.commit.id}
            node={node}
            isExpanded={isExpanded}
            isSelected={isSelected}
            config={config}
            selectedFilePath={isExpanded ? selectedFilePath : undefined}
            trackedBranches={trackedBranches}
            onToggle={createToggleHandler(node.commit.id)}
            onViewAll={
              onViewAll ? createViewAllHandler(node.commit.id) : undefined
            }
            onFileSelect={
              onFileSelect ? createFileSelectHandler(node.commit.id) : undefined
            }
          />
        );
      })}

      {/* Load More button */}
      {hasMore && (
        <div
          className="flex justify-center py-3 px-4"
          data-testid="load-more-container"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="text-xs text-muted-foreground hover:text-foreground"
            data-testid="load-more-button"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
                Loading...
              </>
            ) : (
              "Load More"
            )}
          </Button>
        </div>
      )}

      {/* Empty state hint when no commits and no hasMore */}
      {nodes.length === 0 && !hasMore && (
        <div
          className="flex items-center justify-center py-8 text-muted-foreground text-sm"
          data-testid="empty-list"
        >
          No commits to display
        </div>
      )}
    </div>
  );
}

export const CommitGraphList = memo(CommitGraphListComponent);

export default CommitGraphList;
