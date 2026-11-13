/**
 * Graph Color System
 *
 * Defines the color palette for commit graph visualization.
 * Colors serve both aesthetic and semantic purposes:
 *
 * **Semantic Colors:**
 * - `current`: The current branch (HEAD) - always blue/accent
 * - `remote`: Remote tracking branches - purple
 * - `base`: Base/upstream reference - orange
 *
 * **Rotating Palette:**
 * - `branch-1` through `branch-5`: Assigned to branches as they appear
 * - Colors rotate to ensure visual distinction between adjacent lanes
 *
 * Colors map to CSS custom properties for theme support.
 * In dark mode, colors are slightly adjusted for visibility.
 */

import type { GraphColor } from "../types";

// =============================================================================
// Color Definitions
// =============================================================================

/**
 * Number of rotating branch colors in the palette.
 * This determines how many branches can have unique colors before repeating.
 */
export const BRANCH_COLOR_COUNT = 5;

/**
 * All available graph colors in the rotating palette.
 * Does not include semantic colors (current, remote, base).
 */
export const ROTATING_COLORS: GraphColor[] = [
  "branch-1",
  "branch-2",
  "branch-3",
  "branch-4",
  "branch-5",
];

/**
 * CSS variable mapping for each graph color.
 *
 * These map to Tailwind color classes or CSS custom properties.
 * The actual color values are defined in the theme/CSS.
 *
 * Design rationale:
 * - Colors are chosen for good contrast against dark/light backgrounds
 * - Adjacent colors in the rotation have high visual distinction
 * - Semantic colors (current, remote, base) are consistent with git conventions
 */
export const GRAPH_COLOR_CSS: Record<GraphColor, string> = {
  // Semantic colors
  current: "var(--color-graph-current, #3b82f6)", // Blue - current branch
  remote: "var(--color-graph-remote, #a855f7)", // Purple - remote refs
  base: "var(--color-graph-base, #f97316)", // Orange - base/upstream

  // Rotating palette - chosen for visual distinction
  "branch-1": "var(--color-graph-branch-1, #22c55e)", // Green
  "branch-2": "var(--color-graph-branch-2, #eab308)", // Yellow
  "branch-3": "var(--color-graph-branch-3, #06b6d4)", // Cyan
  "branch-4": "var(--color-graph-branch-4, #ec4899)", // Pink
  "branch-5": "var(--color-graph-branch-5, #ef4444)", // Red
};

// =============================================================================
// Color Utilities
// =============================================================================

/**
 * Get the next color from the rotating palette.
 *
 * Colors rotate through the palette to ensure visual variety.
 * The index can exceed the palette size - it will wrap around.
 *
 * @param index - The color index (typically incremented for each new branch)
 * @returns A GraphColor from the rotating palette
 *
 * @example
 * ```ts
 * let colorIndex = 0;
 * const color1 = getNextColor(colorIndex++); // 'branch-1'
 * const color2 = getNextColor(colorIndex++); // 'branch-2'
 * const color6 = getNextColor(5); // 'branch-1' (wraps around)
 * ```
 */
export function getNextColor(index: number): GraphColor {
  // Use modulo to wrap around the palette
  const normalizedIndex =
    ((index % BRANCH_COLOR_COUNT) + BRANCH_COLOR_COUNT) % BRANCH_COLOR_COUNT;
  return ROTATING_COLORS[normalizedIndex];
}

/**
 * Get the CSS value for a graph color.
 *
 * Returns the CSS custom property reference (with fallback) for the color.
 * Use this when setting inline styles.
 *
 * @param color - The GraphColor to get CSS for
 * @returns CSS color value (custom property with fallback)
 *
 * @example
 * ```ts
 * const style = { stroke: getColorCss('current') };
 * // { stroke: 'var(--color-graph-current, #3b82f6)' }
 * ```
 */
export function getColorCss(color: GraphColor): string {
  return GRAPH_COLOR_CSS[color];
}
