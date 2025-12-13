/**
 * Graph Visualization Module
 *
 * This module contains the core graph computation and rendering logic:
 *
 * - swimlanes.ts: Algorithm to compute swimlane positions from commits
 * - GraphRenderer.ts: Pure functions for SVG path calculations (Phase 4)
 * - GraphCell.tsx: React component that renders the SVG graph (Phase 4)
 * - colors.ts: Color palette and mapping utilities
 * - constants.ts: Rendering configuration constants
 *
 * The graph visualization is the central feature of the commit history view.
 * It shows branching and merging topology using a swimlane model where:
 * - Each vertical lane represents a line of development
 * - Commits are circles positioned in their lane
 * - Lines and curves show how branches connect
 *
 * @example
 * ```tsx
 * import { computeSwimlanes, GRAPH_CONFIG, getColorCss } from './graph';
 *
 * const nodes = computeSwimlanes(commits, { headCommitId });
 * const maxLanes = getMaxLaneCount(nodes);
 * ```
 */

// =============================================================================
// Swimlane Algorithm (Phase 2)
// =============================================================================

export {
  computeSwimlanes,
  getMaxLaneCount,
  findNodeByCommitId,
  getLaneIndexForCommit,
} from "./swimlanes";

export type { ComputeSwimlanesOptions } from "./swimlanes";

// =============================================================================
// Configuration Constants (Phase 2)
// =============================================================================

export {
  LANE_WIDTH,
  ROW_HEIGHT,
  CIRCLE_RADIUS,
  CURVE_RADIUS,
  STROKE_WIDTH,
  MAX_VISIBLE_LANES,
  MIN_GRAPH_WIDTH,
  GRAPH_PADDING,
  CIRCLE_CENTER_Y,
  HEAD_OUTER_RADIUS,
  GRAPH_CONFIG,
  createConfig,
} from "./constants";

// =============================================================================
// Color Utilities (Phase 2)
// =============================================================================

export {
  BRANCH_COLOR_COUNT,
  ROTATING_COLORS,
  GRAPH_COLOR_CSS,
  GRAPH_COLOR_CLASSES,
  getNextColor,
  getColorCss,
  getColorClass,
  isSemanticColor,
} from "./colors";

// =============================================================================
// SVG Rendering (Phase 4 - Not yet implemented)
// =============================================================================

// export { calculateGraphCell, verticalLinePath, curvePath } from './GraphRenderer';

// =============================================================================
// React Components (Phase 4 - Not yet implemented)
// =============================================================================

// export { GraphCell } from './GraphCell';
// export type { GraphCellProps } from './GraphCell';
