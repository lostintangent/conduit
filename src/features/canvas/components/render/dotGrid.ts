/**
 * Dot grid rendering for canvas background.
 * Renders a grid of dots that adapts to the background color.
 */

import type { ViewportState } from "@features/canvas/client/canvasStore";
import { isLightColor } from "@/utils/color";
import type { Size } from "@features/canvas/model";

// =============================================================================
// Constants
// =============================================================================

/** Spacing between dots in world-space pixels */
const DOT_SPACING = 20;

/** Base dot radius in world-space pixels */
const DOT_RADIUS = 1;

/** Maximum dot radius when zoomed in (prevents oversized dots) */
const MAX_DOT_RADIUS = 3;

/** Minimum zoom level to render dots (prevents overly dense grid) */
const MIN_ZOOM_FOR_DOTS = 0.3;

/** Dot fill colors by background type */
const DOT_FILL = {
  onDarkBg: "rgba(255, 255, 255, 0.15)",
  onLightBg: "rgba(0, 0, 0, 0.1)",
} as const;

// =============================================================================
// Main Render Function
// =============================================================================

/**
 * Render a dot grid on the canvas.
 *
 * Draws only dots visible within the current viewport for performance.
 * Uses a single path for all dots to minimize draw calls.
 *
 * Expects the viewport transform to already be applied to the context.
 *
 * @param ctx - Canvas 2D rendering context (with viewport transform applied)
 * @param viewport - Current viewport state (for visibility calculations)
 * @param backgroundColor - Canvas background color (hex)
 * @param canvasSize - Canvas dimensions in screen pixels
 */
export function renderDotGrid(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportState,
  backgroundColor: string,
  canvasSize: Size,
): void {
  if (viewport.zoom < MIN_ZOOM_FOR_DOTS) {
    return;
  }

  // Calculate visible area in world coordinates
  const visibleLeft = -viewport.panX;
  const visibleTop = -viewport.panY;
  const visibleRight = visibleLeft + canvasSize.width / viewport.zoom;
  const visibleBottom = visibleTop + canvasSize.height / viewport.zoom;

  // Snap grid bounds to spacing
  const startX = Math.floor(visibleLeft / DOT_SPACING) * DOT_SPACING;
  const startY = Math.floor(visibleTop / DOT_SPACING) * DOT_SPACING;
  const endX = Math.ceil(visibleRight / DOT_SPACING) * DOT_SPACING;
  const endY = Math.ceil(visibleBottom / DOT_SPACING) * DOT_SPACING;

  // Cap dot radius at high zoom
  const dotRadius = Math.min(DOT_RADIUS, MAX_DOT_RADIUS / viewport.zoom);

  // Draw all dots in a single path for performance
  ctx.fillStyle = isLightColor(backgroundColor)
    ? DOT_FILL.onLightBg
    : DOT_FILL.onDarkBg;
  ctx.beginPath();

  for (let x = startX; x <= endX; x += DOT_SPACING) {
    for (let y = startY; y <= endY; y += DOT_SPACING) {
      ctx.moveTo(x + dotRadius, y);
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
    }
  }

  ctx.fill();
}
