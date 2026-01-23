/**
 * CommitGraph - Commit History Visualization
 *
 * This module provides a visual commit graph for the editor's "Show only changes"
 * view. It displays recent commits with a swimlane-based graph showing branch
 * topology, and allows users to explore file changes within each commit.
 *
 * ## Architecture
 *
 * The commit graph is built around the swimlane model:
 * - Each commit occupies a lane (vertical track)
 * - Lines and curves show how branches connect
 * - The graph is computed from parent relationships
 *
 * ## Usage
 *
 * ```tsx
 * import { CommitGraphPanel } from './CommitGraph';
 *
 * <CommitGraphPanel
 *   git={gitApi}
 *   onFileSelect={({ file, commitId, parentCommitId }) => {
 *     // Open historical diff
 *   }}
 *   onViewCommit={({ commitId, parentCommitId }) => {
 *     // Open commit review pane
 *   }}
 * />
 * ```
 *
 * ## Module Structure
 *
 * - `./types.ts` - Type definitions
 * - `./graph/` - Swimlane algorithm and SVG rendering
 * - `./commit/` - Commit info display components
 * - `./files/` - Expanded file list components
 * - `./refs/` - Git reference (branch/tag) display
 * - `./states/` - Loading, empty, error states
 * - `./hooks/` - State management hooks
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
  // Ref types
  RefType,
  GitRef,
  // Commit types
  HistoryCommit,
  CommitFile,
  CommitStats,
  // Segment types
  SegmentColor,
  // Graph types
  Swimlane,
  GraphColor,
  CommitGraphNode,
  // Render types
  GraphRenderConfig,
  GraphPath,
  GraphCircle,
  GraphCellRenderData,
  // State types
  CommitGraphState,
  // Event types
  CommitFileSelectEvent,
  CommitViewEvent,
} from "./types";

// =============================================================================
// Ref Utilities and Components
// =============================================================================

export {
  parseRef,
  parseRefs,
  sortRefs,
  filterRefsByType,
  filterRefsForDisplay,
  getHeadRef,
  hasRefs,
  RefBadge,
  RefBadgeList,
} from "./refs";
export type { RefBadgeProps, RefBadgeListProps } from "./refs";

// =============================================================================
// Graph Algorithm Utilities
// =============================================================================

export {
  computeSwimlanes,
  getMaxLaneCount,
  findNodeByCommitId,
  getLaneIndexForCommit,
} from "./graph";
export type { ComputeSwimlanesOptions } from "./graph";

// =============================================================================
// Component Exports
// =============================================================================

// Main panel component - primary entry point
export { CommitGraphPanel } from "./CommitGraphPanel";
export type { CommitGraphPanelProps } from "./CommitGraphPanel";

// Supporting components for custom implementations
export { CommitGraphRow } from "./CommitGraphRow";
export type { CommitGraphRowProps } from "./CommitGraphRow";

export { CommitGraphHeader } from "./CommitGraphHeader";
export type { CommitGraphHeaderProps } from "./CommitGraphHeader";

export { CommitGraphList } from "./CommitGraphList";
export type { CommitGraphListProps } from "./CommitGraphList";
