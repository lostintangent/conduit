/**
 * CommitGraphRow Component
 *
 * Renders a single row in the commit graph, combining the graph visualization
 * with the commit summary and optionally the expanded files panel.
 *
 * Layout (collapsed):
 * ```
 * ┌────────┬──────────────────────────────────────────────┐
 * │ Graph  │ Fix authentication bug in login flow    [👁] │
 * │  (O)   │ 2h ago · John Doe · abc1234                  │
 * └────────┴──────────────────────────────────────────────┘
 * ```
 *
 * Layout (expanded):
 * ```
 * ┌────────┬──────────────────────────────────────────────┐
 * │ Graph  │ Fix authentication bug in login flow    [👁] │
 * │  │     │ 2h ago · John Doe · abc1234                  │
 * │  │     ├──────────────────────────────────────────────┤
 * │  │     │ 3 files changed  +25 / -10                   │
 * │  │     │ 📄 src/index.ts           +12 -3  [M]        │
 * │  │     │ 📄 src/utils/helper.ts    +8 -5   [M]        │
 * │  │     │ 📄 README.md              +5 -2   [M]        │
 * └────────┴──────────────────────────────────────────────┘
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

import { memo, useCallback, useMemo } from "react";
import { cn } from "@/utils";
import type { CommitGraphNode, GraphRenderConfig, CommitFile } from "./types";
import { GraphCell } from "./graph";
import { CommitSummary } from "./commit";
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
 * Based on CommitFileItem styling.
 */
const FILE_ITEM_HEIGHT = 28;

/**
 * Height of the files panel header (in pixels).
 * Based on CommitFilesHeader styling.
 */
const FILES_HEADER_HEIGHT = 28;

/**
 * Padding/margin within the files panel (in pixels).
 */
const FILES_PANEL_PADDING = 8;

/**
 * Minimum height for the files panel when loading or empty.
 */
const MIN_FILES_PANEL_HEIGHT = 48;

/**
 * Maximum number of files to show without scrolling.
 * Beyond this, the panel gets a max-height and scrolls.
 */
const MAX_VISIBLE_FILES = 8;

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

  const visibleFiles = Math.min(files.length, MAX_VISIBLE_FILES);
  const contentHeight =
    FILES_HEADER_HEIGHT + visibleFiles * FILE_ITEM_HEIGHT + FILES_PANEL_PADDING;

  return contentHeight;
}

/**
 * Calculate the total row height including expanded content.
 *
 * @param isExpanded - Whether the row is expanded
 * @param files - Array of files
 * @param isLoadingFiles - Whether files are loading
 * @returns Total height in pixels
 */
function calculateRowHeight(
  isExpanded: boolean,
  files: CommitFile[] | undefined,
  isLoadingFiles: boolean,
): number {
  if (!isExpanded) {
    return ROW_HEIGHT;
  }

  const filesPanelHeight = calculateFilesPanelHeight(files, isLoadingFiles);
  return ROW_HEIGHT + filesPanelHeight;
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
  onToggle,
  onViewAll,
  onFileSelect,
  className,
}: CommitGraphRowProps) {
  // Calculate total row height
  const rowHeight = useMemo(
    () => calculateRowHeight(isExpanded, node.files, node.isLoadingFiles),
    [isExpanded, node.files, node.isLoadingFiles],
  );

  // Handle row click
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't toggle if clicking on interactive elements
      const target = e.target as HTMLElement;
      if (
        target.closest("button") ||
        target.closest('[role="listitem"]') ||
        target.closest('[data-testid="commit-files-panel"]')
      ) {
        return;
      }
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

  return (
    <div
      className={cn(
        // Base layout
        "flex items-stretch",
        // Interactive styling
        "cursor-pointer",
        "hover:bg-accent/50",
        "transition-colors duration-150",
        // Selected state (for keyboard navigation)
        isSelected && "bg-accent ring-1 ring-accent-foreground/20",
        // Focus styling
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-expanded={isExpanded}
      aria-label={`Commit: ${node.commit.subject}`}
      data-testid="commit-graph-row"
      data-commit-id={node.commit.id}
    >
      {/* Graph column - fixed width based on lanes */}
      <div className="flex-shrink-0" data-testid="graph-column">
        <GraphCell node={node} height={rowHeight} config={config} />
      </div>

      {/* Content column - flexible width */}
      <div className="flex-1 min-w-0 flex flex-col group">
        {/* Commit summary (always visible) */}
        <div className="h-[44px] flex items-center px-2">
          <CommitSummary
            commit={node.commit}
            isHead={node.isHead}
            onViewAll={onViewAll}
            className="flex-1 min-w-0"
          />
        </div>

        {/* Expanded files panel */}
        {isExpanded && (
          <div className="px-2 pb-2" data-testid="expanded-content">
            <CommitFilesPanel
              files={node.files}
              isLoading={node.isLoadingFiles}
              selectedFilePath={selectedFilePath}
              onFileSelect={onFileSelect}
            />
          </div>
        )}
      </div>
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
