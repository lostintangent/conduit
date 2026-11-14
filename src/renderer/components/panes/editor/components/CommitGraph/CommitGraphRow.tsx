/**
 * CommitGraphRow Component
 *
 * Renders a single row in the commit graph, combining the graph visualization
 * with the commit summary and optionally the expanded files panel.
 *
 * Uses a compact single-line layout matching VS Code's git graph style.
 *
 * Layout (collapsed):
 * ```
 * ┌────┬────────────────────────────────────────────────┐
 * │ ●  │ Fix authentication bug in login flow  John... │
 * └────┴────────────────────────────────────────────────┘
 * ```
 *
 * Layout (expanded):
 * ```
 * ┌────┬────────────────────────────────────────────────┐
 * │ ●  │ Fix authentication bug in login flow  John... │
 * │ │  ├────────────────────────────────────────────────┤
 * │ │  │ 3 files changed  +25 / -10                     │
 * │ │  │ 📄 src/index.ts           +12 -3  [M]          │
 * │ │  │ 📄 src/utils/helper.ts    +8 -5   [M]          │
 * └────┴────────────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <CommitGraphRow
 *   node={graphNode}
 *   isExpanded={expandedCommits.has(node.commit.id)}
 *   config={GRAPH_CONFIG}
 *   onToggle={() => toggleExpand(node.commit.id)}
 *   onViewAll={() => viewCommit(node.commit)}
 *   onFileSelect={(file) => viewFileDiff(file, node.commit.id)}
 * />
 * ```
 */

import { memo, useCallback } from "react";
import { cn } from "@/utils";
import type { CommitGraphNode, GraphRenderConfig, CommitFile } from "./types";
import type { TrackedBranchInfo } from "@features/git/client/GitV2API";
import { GraphCell } from "./graph";
import { CommitSummary, CommitTooltip } from "./commit";
import { CommitFilesPanel } from "./files";
import { ROW_HEIGHT } from "./graph/constants";

// =============================================================================
// Types
// =============================================================================

export interface CommitGraphRowProps {
  /** The commit graph node to render */
  node: CommitGraphNode;

  /** Whether this row is expanded to show files */
  isExpanded: boolean;

  /** Graph rendering configuration */
  config: GraphRenderConfig;

  /** Whether this row is selected (for keyboard navigation) */
  isSelected?: boolean;

  /** Currently selected file path within expanded panel */
  selectedFilePath?: string;

  /**
   * Tracked branch information for VS Code-style colored badges.
   * When provided, shows colored badges for current, upstream, and base branches.
   */
  trackedBranches?: TrackedBranchInfo | null;

  /** Called when the row is clicked to toggle expansion */
  onToggle?: () => void;

  /** Called when the "view all" button is clicked */
  onViewAll?: () => void;

  /** Called when a file is selected in the expanded panel */
  onFileSelect?: (file: CommitFile) => void;

  /** Optional className for the row container */
  className?: string;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Height of each file item in the files panel (in pixels).
 * Based on CommitFileItem styling: py-0.5 (4px) + text-[12px] (~18px) = ~22px
 */
const FILE_ITEM_HEIGHT = 22;

/**
 * Height of the files panel header (in pixels).
 * Based on CommitFilesHeader styling: py-1 (8px) + text-[11px] (~16px) + border-b (1px) = ~25px
 */
const FILES_HEADER_HEIGHT = 25;

/**
 * Padding/margin within the files panel (in pixels).
 * Includes: wrapper pb-2 (8px) + file list py-0.5 (4px) + buffer for sub-pixel rendering = 14px
 */
const FILES_PANEL_PADDING = 14;

/**
 * Minimum height for the files panel when loading or empty.
 */
const MIN_FILES_PANEL_HEIGHT = 48;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Calculate the height of the expanded files panel.
 *
 * @param files - Array of files (may be undefined while loading)
 * @param isLoading - Whether files are currently loading
 * @returns Height in pixels
 */
function calculateFilesPanelHeight(
  files: CommitFile[] | undefined,
  isLoading: boolean,
): number {
  if (isLoading || !files) {
    return MIN_FILES_PANEL_HEIGHT;
  }

  if (files.length === 0) {
    return MIN_FILES_PANEL_HEIGHT;
  }

  // Calculate height for all files - graph lines need to extend through entire list
  const contentHeight =
    FILES_HEADER_HEIGHT + files.length * FILE_ITEM_HEIGHT + FILES_PANEL_PADDING;

  return contentHeight;
}

// =============================================================================
// Component
// =============================================================================

/**
 * CommitGraphRow renders a single row in the commit graph.
 *
 * The row is composed of:
 * - GraphCell (left): SVG visualization of the graph
 * - CommitSummary (right): Commit message and metadata
 * - CommitFilesPanel (when expanded): List of changed files
 *
 * The component handles:
 * - Click to toggle expansion
 * - Hover and selected states
 * - Variable height when expanded
 * - Keyboard focus styling
 */
function CommitGraphRowComponent({
  node,
  isExpanded,
  config,
  isSelected = false,
  selectedFilePath,
  trackedBranches,
  onToggle,
  onViewAll,
  onFileSelect,
  className,
}: CommitGraphRowProps) {
  // Handle row click
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't toggle if clicking on interactive elements
      if ((e.target as HTMLElement).closest("button")) return;
      onToggle?.();
    },
    [onToggle],
  );

  // Handle keyboard activation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle?.();
      }
    },
    [onToggle],
  );

  // Calculate the height of the expanded files section
  const filesPanelHeight = isExpanded
    ? calculateFilesPanelHeight(node.files, node.isLoadingFiles ?? false)
    : 0;

  return (
    <div
      role="listitem"
      className={cn("flex flex-col", className)}
      data-testid="commit-graph-row"
      data-commit-id={node.commit.id}
    >
      {/* Commit summary row - graph + content, highlights on hover */}
      <CommitTooltip
        commit={node.commit}
        isHead={node.isHead}
        trackedBranches={trackedBranches}
        side="bottom"
        delayDuration={500}
      >
        <div
          className={cn(
            "flex items-stretch",
            "cursor-pointer",
            "rounded-md",
            "transition-colors duration-150",
            // Use same colors as FileTreeItem
            isSelected
              ? "bg-accent/20 hover:bg-accent/25"
              : "hover:bg-foreground/10",
            // Focus styling
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="button"
          aria-expanded={isExpanded}
          aria-current={node.isHead || undefined}
          aria-label={`Commit: ${node.commit.subject}`}
          data-testid="commit-summary-row"
        >
          {/* Graph - just the commit row portion */}
          <div className="flex-shrink-0 pr-2" data-testid="graph-column">
            <GraphCell node={node} height={ROW_HEIGHT} config={config} />
          </div>

          {/* Commit summary - pt-px nudges text down 1px to align with graph dot */}
          <div className="flex-1 min-w-0 h-6 flex items-center pr-2 pt-px group">
            <CommitSummary
              commit={node.commit}
              isHead={node.isHead}
              trackedBranches={trackedBranches}
              onViewAll={onViewAll}
              className="flex-1 min-w-0"
            />
          </div>
        </div>
      </CommitTooltip>

      {/* Expanded section - graph continuation + files panel, no hover */}
      {isExpanded && (
        <div className="flex items-stretch">
          {/* Graph continuation - just the lines going down */}
          <div className="flex-shrink-0 pr-2">
            <GraphCell
              node={node}
              height={filesPanelHeight}
              config={config}
              hideCircle
            />
          </div>

          {/* Files panel - pr-2 to match commit summary row (no left padding) */}
          <div
            className="flex-1 min-w-0 pr-2 pb-2"
            data-testid="expanded-content"
          >
            <CommitFilesPanel
              files={node.files}
              isLoading={node.isLoadingFiles}
              selectedFilePath={selectedFilePath}
              onFileSelect={onFileSelect}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Memoized CommitGraphRow component.
 *
 * The memoization compares props shallowly, which works correctly because:
 * - node is replaced (not mutated) when data changes
 * - isExpanded is a primitive
 * - config is typically a constant
 * - callbacks should be stable (using useCallback in parent)
 */
export const CommitGraphRow = memo(CommitGraphRowComponent);

export default CommitGraphRow;
