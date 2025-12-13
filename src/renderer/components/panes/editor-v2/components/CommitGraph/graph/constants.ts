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
 * This should match the height of the commit summary content
 * (approximately 2 lines of text with padding).
 *
 * 44px accommodates:
 * - Subject line (~20px)
 * - Author/hash line (~16px)
 * - Vertical padding (~8px)
 */
export const ROW_HEIGHT = 44;

/**
 * Radius of the commit circle in pixels.
 *
 * The circle is the visual anchor for each commit.
 * 5px provides good visibility without overwhelming the graph.
 */
export const CIRCLE_RADIUS = 5;

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
 * 2px provides good visibility on both light and dark backgrounds.
 */
export const STROKE_WIDTH = 2;

// =============================================================================
// Layout Constraints
// =============================================================================

/**
 * Maximum number of lanes to display before horizontal scrolling.
 *
 * Beyond this, the graph column becomes scrollable.
 * 8 lanes handles most real-world scenarios without being too wide.
 */
export const MAX_VISIBLE_LANES = 8;

/**
 * Minimum width of the graph column in pixels.
 *
 * Even with a single lane, maintain minimum width for visual consistency.
 * Equals 2 lane widths to ensure the circle has breathing room.
 */
export const MIN_GRAPH_WIDTH = LANE_WIDTH * 2;

/**
 * Padding from edge of graph column to first/last lane center.
 *
 * Half a lane width ensures circles don't touch the edges.
 */
export const GRAPH_PADDING = LANE_WIDTH / 2;

// =============================================================================
// Derived Constants
// =============================================================================

/**
 * Y-coordinate where commit circles are centered (middle of row).
 */
export const CIRCLE_CENTER_Y = ROW_HEIGHT / 2;

/**
 * Outer radius for HEAD commit indicator (double-circle effect).
 *
 * The HEAD commit gets an outer ring to make it stand out.
 */
export const HEAD_OUTER_RADIUS = CIRCLE_RADIUS + 3;

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
};

/**
 * Create a custom configuration by overriding defaults.
 *
 * Use this when you need non-standard dimensions (e.g., for expanded rows).
 *
 * @param overrides - Partial config to merge with defaults
 * @returns Complete GraphRenderConfig
 *
 * @example
 * ```ts
 * const expandedConfig = createConfig({ rowHeight: 200 });
 * ```
 */
export function createConfig(
  overrides: Partial<GraphRenderConfig>,
): GraphRenderConfig {
  return { ...GRAPH_CONFIG, ...overrides };
}
