/**
 * Graph Rendering Constants
 *
 * Defines the dimensions and styling constants for SVG graph rendering.
 * These values are carefully chosen to balance:
 *
 * - **Readability**: Graph elements must be clearly visible
 * - **Density**: Fit useful history in available space
 * - **Aesthetics**: Clean, professional appearance
 *
 * All measurements are in pixels unless otherwise noted.
 */

import type { GraphRenderConfig } from "../types";

// =============================================================================
// Core Dimensions
// =============================================================================

/**
 * Width of each swimlane column in pixels.
 *
 * This determines the horizontal spacing between lanes.
 * Smaller values = more compact graph, larger = more readable.
 *
 * 16px provides good balance - enough space for curves without wasting space.
 */
export const LANE_WIDTH = 16;

/**
 * Height of a standard (collapsed) commit row in pixels.
 *
 * This should match the height of a single line in the file tree
 * for visual consistency. VS Code uses ~22px for commit rows.
 *
 * 24px accommodates:
 * - Single line with subject and author
 * - Minimal vertical padding
 */
export const ROW_HEIGHT = 24;

/**
 * Radius of the commit circle in pixels.
 *
 * The circle is the visual anchor for each commit.
 * 4px matches VS Code's compact graph style.
 */
export const CIRCLE_RADIUS = 4;

/**
 * Radius for curved paths when lanes merge or split.
 *
 * Used in SVG quadratic curves (Q command).
 * 6px gives smooth, natural-looking curves.
 */
export const CURVE_RADIUS = 6;

/**
 * Stroke width for graph lines in pixels.
 *
 * 1px matches VS Code's thin line style.
 */
export const STROKE_WIDTH = 1;

/**
 * Gap between lines and commit circles in pixels.
 *
 * VS Code has a small gap between lines and circles.
 */
export const LINE_GAP = 2;

// =============================================================================
// Derived Constants
// =============================================================================

/**
 * Extra padding between lines and HEAD commit circle.
 *
 * HEAD commits render with a larger circle (1.25x scale), so we add
 * extra padding to prevent lines from overlapping the larger ring.
 */
export const HEAD_CIRCLE_EXTRA_PADDING = 1.5;

// =============================================================================
// Configuration Object
// =============================================================================

/**
 * Default graph rendering configuration.
 *
 * This object bundles all the constants needed by the renderer.
 * Pass this to rendering functions for consistent output.
 *
 * @example
 * ```ts
 * import { GRAPH_CONFIG } from './constants';
 *
 * const renderData = calculateGraphCell(node, GRAPH_CONFIG);
 * ```
 */
export const GRAPH_CONFIG: GraphRenderConfig = {
  laneWidth: LANE_WIDTH,
  rowHeight: ROW_HEIGHT,
  circleRadius: CIRCLE_RADIUS,
  curveRadius: CURVE_RADIUS,
  strokeWidth: STROKE_WIDTH,
  lineGap: LINE_GAP,
};
