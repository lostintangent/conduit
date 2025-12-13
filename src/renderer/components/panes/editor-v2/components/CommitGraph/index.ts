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
 * ## Main Components
 *
 * - `CommitGraphPanel`: Top-level container for the entire feature
 *
 * ## Usage
 *
 * ```tsx
 * import { CommitGraphPanel } from './CommitGraph';
 *
 * <CommitGraphPanel
 *   cwd="/path/to/repo"
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
 * - `./states/` - Loading, empty, error states
 * - `./hooks/` - State management hooks
 *
 * @see docs/architecture/commit-graph-design.md
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
  // Commit types
  HistoryCommit,
  CommitFile,
  CommitStats,
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
// Component Exports
// =============================================================================

// Phase 9: Row component
export { CommitGraphRow } from "./CommitGraphRow";
export type { CommitGraphRowProps } from "./CommitGraphRow";

// Phase 11: Main panel component (uncomment when implemented)
// export { CommitGraphPanel } from './CommitGraphPanel';
// export type { CommitGraphPanelProps } from './CommitGraphPanel';
