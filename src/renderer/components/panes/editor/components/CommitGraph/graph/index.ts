/**
 * Graph Visualization Module
 *
 * This module contains the core graph computation and rendering logic:
 *
 * - swimlanes.ts: Algorithm to compute swimlane positions from commits
 * - renderer.ts: Pure functions for SVG path calculations
 * - GraphCell.tsx: React component that renders the SVG graph
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
 * import {
 *   computeSwimlanes,
 *   GRAPH_CONFIG,
 *   GraphCell,
 * } from './graph';
 *
 * const nodes = computeSwimlanes(commits, { headCommitId });
 *
 * // Render each node
 * nodes.map(node => (
 *   <GraphCell key={node.commit.id} node={node} height={44} config={GRAPH_CONFIG} />
 * ));
 * ```
 */

// =============================================================================
// Swimlane Algorithm
// =============================================================================

export {
  computeSwimlanes,
  getMaxLaneCount,
  findNodeByCommitId,
  getLaneIndexForCommit,
} from "./swimlanes";

export type { ComputeSwimlanesOptions } from "./swimlanes";

// =============================================================================
// Configuration Constants
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
// Color Utilities
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
// SVG Rendering
// =============================================================================

export {
  // Position calculations
  laneX,
  rowCenterY,
  // Path generation
  verticalLinePath,
  curvePathBetweenLanes,
  pathFromAbove,
  pathToBelow,
  passThroughPath,
  // Lane analysis
  getPassThroughLanes,
  findCommitInputLane,
  // Circle calculation
  calculateCircle,
  // Complete cell calculation
  calculateGraphCell,
  // Utilities
  calculateGraphWidth,
} from "./renderer";

// =============================================================================
// React Components
// =============================================================================

export { GraphCell } from "./GraphCell";
export type { GraphCellProps } from "./GraphCell";
