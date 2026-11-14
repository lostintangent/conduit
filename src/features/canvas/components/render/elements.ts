/**
 * Rendering utilities for canvas elements.
 * Each element type has a dedicated render function that applies its transform.
 */

import type {
  CanvasElement,
  FillPattern,
  ImageElement,
  ShapeElement,
  StrokeElement,
  TextElement,
} from "@features/canvas/model";
import {
  HANDLE_SIZE,
  ROTATION_HANDLE_DISTANCE,
  ROTATION_HANDLE_RADIUS,
} from "../utils/transformUtils";

// =============================================================================
// Constants
// =============================================================================

// Arrow head sizing: multiplier for stroke width to determine head length
export const ARROW_HEAD_LENGTH_MULTIPLIER = 3;
// Minimum arrow head length in pixels (ensures visibility for thin strokes)
export const ARROW_HEAD_MIN_LENGTH = 8;
// Arrow head width as a ratio of head length
export const ARROW_HEAD_WIDTH_RATIO = 0.6;

/**
 * Calculate arrow head dimensions based on stroke width.
 * Used for both canvas rendering and SVG preview.
 */
export function calculateArrowHead(strokeWidth: number): {
  length: number;
  width: number;
} {
  const length = Math.max(
    strokeWidth * ARROW_HEAD_LENGTH_MULTIPLIER,
    ARROW_HEAD_MIN_LENGTH,
  );
  const width = length * ARROW_HEAD_WIDTH_RATIO;
  return { length, width };
}

// Minimum hit padding for line/arrow elements to make them easier to select
const LINE_HIT_PADDING_MIN = 10;

// Default spacing for fill patterns (in pixels)
const FILL_PATTERN_SPACING = 8;

// =============================================================================
// Fill Pattern Cache
// =============================================================================

// Cache for fill patterns to avoid recreating on every render
// Key format: "pattern:color:dpr" (e.g., "diagonal:#ff0000:2")
const fillPatternCache = new Map<string, CanvasPattern>();

/**
 * Create a fill pattern for a shape element.
 * Patterns are cached for performance and rendered at device pixel ratio for sharpness.
 *
 * @param ctx - Canvas rendering context (used to create the pattern)
 * @param pattern - Pattern type (solid, diagonal, cross, dots)
 * @param color - Pattern color
 * @param scale - Element scale to adjust pattern density
 * @param zoom - Viewport zoom level (1.0 = 100%)
 * @returns CanvasPattern or null if creation fails
 */
function getFillPattern(
  ctx: CanvasRenderingContext2D,
  pattern: FillPattern,
  color: string,
  scale: { scaleX: number; scaleY: number },
  zoom: number,
): CanvasPattern | string | null {
  // Solid fills just use the color directly
  if (pattern === "solid") {
    return color;
  }

  // Get device pixel ratio for sharp rendering on high-DPI displays
  const dpr = window.devicePixelRatio || 1;

  // Effective scale includes zoom level for sharp patterns at all zoom levels
  const effectiveScale = dpr * zoom;

  // Check cache first (include DPR and zoom in key since patterns need to be recreated if either changes)
  const cacheKey = `${pattern}:${color}:${effectiveScale.toFixed(2)}`;
  const cached = fillPatternCache.get(cacheKey);
  if (cached) {
    // Scale pattern back down to logical size, accounting for element scale, DPR, and zoom
    const matrix = new DOMMatrix();
    matrix.scaleSelf(
      1 / (scale.scaleX * effectiveScale),
      1 / (scale.scaleY * effectiveScale),
    );
    cached.setTransform(matrix);
    return cached;
  }

  // Create pattern tile at higher resolution for sharp rendering
  // Scale by both DPR and zoom for sharp patterns at all zoom levels
  const size = FILL_PATTERN_SPACING;
  const physicalSize = size * effectiveScale;
  const offscreen = new OffscreenCanvas(physicalSize, physicalSize);
  const patternCtx = offscreen.getContext("2d");
  if (!patternCtx) return null;

  // Scale up drawing commands for high-DPI and zoom
  patternCtx.scale(effectiveScale, effectiveScale);

  patternCtx.strokeStyle = color;
  patternCtx.fillStyle = color;
  patternCtx.lineWidth = 1;

  switch (pattern) {
    case "diagonal":
      // Single diagonal line from bottom-left to top-right
      patternCtx.beginPath();
      patternCtx.moveTo(0, size);
      patternCtx.lineTo(size, 0);
      // Add extra lines at edges for seamless tiling
      patternCtx.moveTo(-size / 2, size / 2);
      patternCtx.lineTo(size / 2, -size / 2);
      patternCtx.moveTo(size / 2, size + size / 2);
      patternCtx.lineTo(size + size / 2, size / 2);
      patternCtx.stroke();
      break;

    case "cross":
      // Crosshatch - two diagonal lines
      patternCtx.beginPath();
      // Bottom-left to top-right
      patternCtx.moveTo(0, size);
      patternCtx.lineTo(size, 0);
      // Top-left to bottom-right
      patternCtx.moveTo(0, 0);
      patternCtx.lineTo(size, size);
      patternCtx.stroke();
      break;

    case "dots":
      // Single dot in center
      patternCtx.beginPath();
      patternCtx.arc(size / 2, size / 2, 1.5, 0, Math.PI * 2);
      patternCtx.fill();
      break;
  }

  const canvasPattern = ctx.createPattern(offscreen, "repeat");
  if (!canvasPattern) return null;

  // Cache the pattern
  fillPatternCache.set(cacheKey, canvasPattern);

  // Scale pattern back down to logical size, accounting for element scale, DPR, and zoom
  const matrix = new DOMMatrix();
  matrix.scaleSelf(
    1 / (scale.scaleX * effectiveScale),
    1 / (scale.scaleY * effectiveScale),
  );
  canvasPattern.setTransform(matrix);

  return canvasPattern;
}

// =============================================================================
// Image Cache
// =============================================================================

// Cache for decoded images to avoid re-decoding on every render
const imageCache = new Map<string, HTMLImageElement>();

/**
 * Get or create a cached HTMLImageElement for an ImageElement.
 */
function getCachedImage(element: ImageElement): HTMLImageElement | null {
  const cached = imageCache.get(element.id);
  if (cached) return cached;

  const img = new Image();
  img.src = `data:${element.mimeType};base64,${element.data}`;

  // Store in cache once loaded
  img.onload = () => {
    imageCache.set(element.id, img);
  };

  // Return null if not yet loaded (will be available on next render)
  if (img.complete) {
    imageCache.set(element.id, img);
    return img;
  }

  return null;
}

/**
 * Clear an image from the cache (call when element is deleted).
 */
export function clearImageCache(elementId: string): void {
  imageCache.delete(elementId);
}

// =============================================================================
// Render Functions
// =============================================================================

/**
 * Helper function to set stroke rendering style (normal stroke vs eraser).
 * Centralizes the composite operation logic used by both committed strokes and preview strokes.
 *
 * @param ctx - Canvas rendering context
 * @param isEraser - Whether this is an eraser stroke
 * @param color - Stroke color (ignored if isEraser is true)
 */
export function applyStrokeStyle(
  ctx: CanvasRenderingContext2D,
  isEraser: boolean,
  color: string,
): void {
  if (isEraser) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)"; // Color doesn't matter for eraser, but required
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = color;
  }
}

/**
 * Render a stroke element to the canvas context.
 *
 * Rendering contract:
 * - Expects: Canvas context with viewport transform already applied
 * - Modifies: All rendering state (composite operation, stroke style, line width, etc.)
 * - Guarantees: Restores state via ctx.save()/restore(), but composite operation may persist
 *
 * @param ctx - Canvas rendering context
 * @param element - The stroke element to render
 */
function renderStroke(
  ctx: CanvasRenderingContext2D,
  element: StrokeElement,
): void {
  if (element.points.length < 2) return;

  ctx.save();

  // Apply transform
  ctx.translate(element.transform.x, element.transform.y);
  ctx.rotate((element.transform.rotation * Math.PI) / 180);
  ctx.scale(element.transform.scaleX, element.transform.scaleY);

  // Set up stroke style (normal stroke vs eraser)
  applyStrokeStyle(ctx, element.isEraser ?? false, element.style.color);

  ctx.lineWidth = element.style.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Draw the stroke path
  ctx.beginPath();
  ctx.moveTo(element.points[0].x, element.points[0].y);

  for (let i = 1; i < element.points.length; i++) {
    ctx.lineTo(element.points[i].x, element.points[i].y);
  }

  ctx.stroke();
  ctx.restore();
}

/**
 * Render a text element to the canvas context.
 *
 * Rendering contract:
 * - Expects: Canvas context with viewport transform already applied
 * - Modifies: Font, fill style, text alignment, composite operation
 * - Guarantees: Restores all state via ctx.save()/restore()
 *
 * @param ctx - Canvas rendering context
 * @param element - The text element to render
 */
function renderText(ctx: CanvasRenderingContext2D, element: TextElement): void {
  if (!element.content) return;

  ctx.save();

  // Apply transform
  ctx.translate(element.transform.x, element.transform.y);
  ctx.rotate((element.transform.rotation * Math.PI) / 180);
  ctx.scale(element.transform.scaleX, element.transform.scaleY);

  // Set up text style
  ctx.globalCompositeOperation = "source-over";
  ctx.font = `${element.style.fontSize}px ${element.style.fontFamily}`;
  ctx.fillStyle = element.style.color;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  // Draw text centered on transform position
  const metrics = ctx.measureText(element.content);
  const textWidth = metrics.width;
  const textHeight = element.style.fontSize;

  ctx.fillText(element.content, -textWidth / 2, -textHeight / 2);

  ctx.restore();
}

/**
 * Render an image element to the canvas context.
 *
 * Rendering contract:
 * - Expects: Canvas context with viewport transform already applied
 * - Modifies: Composite operation only
 * - Guarantees: Restores all state via ctx.save()/restore()
 *
 * @param ctx - Canvas rendering context
 * @param element - The image element to render
 */
function renderImage(
  ctx: CanvasRenderingContext2D,
  element: ImageElement,
): void {
  const img = getCachedImage(element);
  if (!img) return; // Not yet loaded

  ctx.save();

  // Apply transform
  ctx.translate(element.transform.x, element.transform.y);
  ctx.rotate((element.transform.rotation * Math.PI) / 180);
  ctx.scale(element.transform.scaleX, element.transform.scaleY);

  // Set composite operation for normal rendering
  ctx.globalCompositeOperation = "source-over";

  // Draw image centered on transform position
  const width = element.originalSize.width;
  const height = element.originalSize.height;

  ctx.drawImage(img, -width / 2, -height / 2, width, height);

  ctx.restore();
}

/**
 * Render a shape element to the canvas context.
 *
 * Rendering contract:
 * - Expects: Canvas context with viewport transform already applied
 * - Modifies: Stroke style, fill style, line width, line cap/join, composite operation
 * - Guarantees: Restores all state via ctx.save()/restore()
 *
 * @param ctx - Canvas rendering context
 * @param element - The shape element to render
 * @param zoom - Viewport zoom level (1.0 = 100%)
 */
function renderShape(
  ctx: CanvasRenderingContext2D,
  element: ShapeElement,
  zoom: number,
): void {
  ctx.save();

  // Apply transform
  ctx.translate(element.transform.x, element.transform.y);
  ctx.rotate((element.transform.rotation * Math.PI) / 180);
  ctx.scale(element.transform.scaleX, element.transform.scaleY);

  // Set up stroke style
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = element.style.color;
  ctx.lineWidth = element.style.width;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";

  // Set up fill style if present
  const fill = element.style.fill;
  const hasFill = fill !== undefined;
  if (hasFill) {
    const fillStyle = getFillPattern(
      ctx,
      fill.pattern,
      fill.color,
      {
        scaleX: element.transform.scaleX,
        scaleY: element.transform.scaleY,
      },
      zoom,
    );
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
    }
  }

  const hw = element.size.width / 2;
  const hh = element.size.height / 2;

  switch (element.shapeType) {
    case "rectangle":
      if (hasFill) {
        ctx.fillRect(-hw, -hh, element.size.width, element.size.height);
      }
      ctx.strokeRect(-hw, -hh, element.size.width, element.size.height);
      break;

    case "ellipse":
      ctx.beginPath();
      ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
      if (hasFill) {
        ctx.fill();
      }
      ctx.stroke();
      break;

    case "line":
      // Lines don't support fill
      ctx.beginPath();
      ctx.moveTo(-hw, 0);
      ctx.lineTo(hw, 0);
      ctx.stroke();
      break;

    case "arrow": {
      // Arrows don't support fill
      // Draw line
      ctx.beginPath();
      ctx.moveTo(-hw, 0);
      ctx.lineTo(hw, 0);
      ctx.stroke();

      // Draw arrowhead as a connected path so the tip comes to a point
      const { length: headLength, width: headWidth } = calculateArrowHead(
        element.style.width,
      );
      ctx.lineJoin = "miter";
      ctx.beginPath();
      ctx.moveTo(hw - headLength, -headWidth);
      ctx.lineTo(hw, 0);
      ctx.lineTo(hw - headLength, headWidth);
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

// =============================================================================
// Main Render Function
// =============================================================================

/**
 * Render a single element to the canvas context.
 * @param ctx - Canvas rendering context
 * @param element - The element to render
 * @param zoom - Viewport zoom level (1.0 = 100%), used for pattern rendering
 */
export function renderElement(
  ctx: CanvasRenderingContext2D,
  element: CanvasElement,
  zoom = 1,
): void {
  switch (element.type) {
    case "stroke":
      renderStroke(ctx, element);
      break;
    case "text":
      renderText(ctx, element);
      break;
    case "image":
      renderImage(ctx, element);
      break;
    case "shape":
      renderShape(ctx, element, zoom);
      break;
  }
}

/**
 * Render all elements to the canvas context.
 * Elements are rendered in order (first = bottom, last = top).
 * @param ctx - Canvas rendering context
 * @param elements - Array of elements to render
 * @param zoom - Viewport zoom level (1.0 = 100%), used for pattern rendering
 */
export function renderAllElements(
  ctx: CanvasRenderingContext2D,
  elements: CanvasElement[],
  zoom = 1,
): void {
  for (const element of elements) {
    renderElement(ctx, element, zoom);
  }
}

// =============================================================================
// Selection Box Rendering
// =============================================================================

/**
 * Render a selection box around an element (without handles).
 * Used for basic selection indication in multi-selection scenarios.
 *
 * Rendering contract:
 * - Expects: Canvas context with viewport transform already applied
 * - Modifies: Stroke style, line width, line dash, composite operation
 * - Guarantees: Restores all state via ctx.save()/restore(), sets composite operation to "source-over"
 *
 * @param ctx - Canvas rendering context
 * @param element - The element to draw selection box around
 */
export function renderSelectionBox(
  ctx: CanvasRenderingContext2D,
  element: CanvasElement,
): void {
  ctx.save();

  // Ensure normal rendering mode (selection indicators should never erase)
  ctx.globalCompositeOperation = "source-over";

  // Apply transform (position and rotation only, not scale for the box itself)
  ctx.translate(element.transform.x, element.transform.y);
  ctx.rotate((element.transform.rotation * Math.PI) / 180);

  // Get bounds based on element type
  const bounds = getElementBounds(element);
  const halfWidth = (bounds.width * element.transform.scaleX) / 2;
  const halfHeight = (bounds.height * element.transform.scaleY) / 2;

  // Draw selection rectangle
  ctx.strokeStyle = "#3b82f6"; // Blue
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(-halfWidth, -halfHeight, halfWidth * 2, halfHeight * 2);

  ctx.restore();
}

/**
 * Render endpoint handles for lines and arrows.
 * Shows circular handles at start and end points that can be dragged.
 *
 * Rendering contract:
 * - Expects: Canvas context with viewport transform already applied
 * - Modifies: Fill style, stroke style, line width, composite operation
 * - Guarantees: Restores all state via ctx.save()/restore(), sets composite operation to "source-over"
 *
 * @param ctx - Canvas rendering context
 * @param element - The line or arrow element
 * @param zoom - Current zoom level (handles are drawn at constant screen size)
 */
export function renderLineEndpointHandles(
  ctx: CanvasRenderingContext2D,
  element: ShapeElement,
  zoom: number,
): void {
  if (element.shapeType !== "line" && element.shapeType !== "arrow") return;

  ctx.save();

  // Ensure normal rendering mode (selection indicators should never erase)
  ctx.globalCompositeOperation = "source-over";

  // Apply transform (position and rotation)
  ctx.translate(element.transform.x, element.transform.y);
  ctx.rotate((element.transform.rotation * Math.PI) / 180);

  // Adjust handle sizes for zoom so they appear constant on screen
  const handleRadius = HANDLE_SIZE / zoom / 2;
  const lineWidth = 1 / zoom;

  // Line endpoints (in local coordinates, accounting for scale)
  const startX = (-element.size.width * element.transform.scaleX) / 2;
  const startY = 0;
  const endX = (element.size.width * element.transform.scaleX) / 2;
  const endY = 0;

  // Draw selection line between endpoints
  ctx.strokeStyle = "#3b82f6"; // Blue
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // Draw handles at both endpoints
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = lineWidth;

  // Start point handle
  ctx.beginPath();
  ctx.arc(startX, startY, handleRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // End point handle
  ctx.beginPath();
  ctx.arc(endX, endY, handleRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/**
 * Render selection handles around an element.
 * Includes corner resize handles and a rotation handle above the element.
 *
 * Rendering contract:
 * - Expects: Canvas context with viewport transform already applied
 * - Modifies: Fill style, stroke style, line width, line dash, composite operation
 * - Guarantees: Restores all state via ctx.save()/restore(), sets composite operation to "source-over"
 *
 * @param ctx - Canvas rendering context
 * @param element - The selected element
 * @param zoom - Current zoom level (handles are drawn at constant screen size)
 */
export function renderSelectionHandles(
  ctx: CanvasRenderingContext2D,
  element: CanvasElement,
  zoom: number,
): void {
  ctx.save();

  // Ensure normal rendering mode (selection indicators should never erase)
  ctx.globalCompositeOperation = "source-over";

  // Apply transform (position and rotation)
  ctx.translate(element.transform.x, element.transform.y);
  ctx.rotate((element.transform.rotation * Math.PI) / 180);

  // Get bounds based on element type
  const bounds = getElementBounds(element);
  const halfWidth = (bounds.width * element.transform.scaleX) / 2;
  const halfHeight = (bounds.height * element.transform.scaleY) / 2;

  // Adjust handle sizes for zoom so they appear constant on screen
  const handleSize = HANDLE_SIZE / zoom;
  const rotationDistance = ROTATION_HANDLE_DISTANCE / zoom;
  const rotationRadius = ROTATION_HANDLE_RADIUS / zoom;
  const lineWidth = 1 / zoom;

  // Draw selection rectangle (solid line for handles mode)
  ctx.strokeStyle = "#3b82f6"; // Blue
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([]);
  ctx.strokeRect(-halfWidth, -halfHeight, halfWidth * 2, halfHeight * 2);

  // Corner handle positions
  const corners = [
    { x: -halfWidth, y: -halfHeight }, // top-left
    { x: halfWidth, y: -halfHeight }, // top-right
    { x: halfWidth, y: halfHeight }, // bottom-right
    { x: -halfWidth, y: halfHeight }, // bottom-left
  ];

  // Draw corner handles
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = lineWidth;

  for (const corner of corners) {
    ctx.fillRect(
      corner.x - handleSize / 2,
      corner.y - handleSize / 2,
      handleSize,
      handleSize,
    );
    ctx.strokeRect(
      corner.x - handleSize / 2,
      corner.y - handleSize / 2,
      handleSize,
      handleSize,
    );
  }

  // Draw rotation handle line
  ctx.beginPath();
  ctx.moveTo(0, -halfHeight);
  ctx.lineTo(0, -halfHeight - rotationDistance);
  ctx.stroke();

  // Draw rotation handle circle
  ctx.beginPath();
  ctx.arc(0, -halfHeight - rotationDistance, rotationRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

/**
 * Get the bounding box dimensions of an element (before scaling).
 */
export function getElementBounds(element: CanvasElement): {
  width: number;
  height: number;
} {
  switch (element.type) {
    case "stroke": {
      // Calculate bounds from points
      if (element.points.length === 0) {
        return { width: 0, height: 0 };
      }
      let minX = element.points[0].x;
      let maxX = element.points[0].x;
      let minY = element.points[0].y;
      let maxY = element.points[0].y;

      for (const point of element.points) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }

      // Add stroke width to bounds
      const padding = element.style.width / 2;
      return {
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2,
      };
    }

    case "text":
      return element.boundingBox;

    case "image":
      return element.originalSize;

    case "shape": {
      // For lines/arrows, add some height for hit testing
      if (element.shapeType === "line" || element.shapeType === "arrow") {
        const hitPadding = Math.max(element.style.width, LINE_HIT_PADDING_MIN);
        return { width: element.size.width, height: hitPadding };
      }
      return element.size;
    }
  }
}

/**
 * Calculate the combined axis-aligned bounding box of all elements.
 * Takes into account position, scale, and rotation.
 * Returns null if there are no elements.
 */
export function calculateElementsBoundingBox(
  elements: CanvasElement[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (elements.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const element of elements) {
    const bounds = getElementBounds(element);
    const { x, y, rotation, scaleX, scaleY } = element.transform;

    // Calculate half-dimensions after scaling
    const hw = (bounds.width * Math.abs(scaleX)) / 2;
    const hh = (bounds.height * Math.abs(scaleY)) / 2;

    // For rotated elements, calculate the axis-aligned bounding box
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));

    // Rotated bounding box dimensions
    const rotatedHW = hw * cos + hh * sin;
    const rotatedHH = hw * sin + hh * cos;

    minX = Math.min(minX, x - rotatedHW);
    minY = Math.min(minY, y - rotatedHH);
    maxX = Math.max(maxX, x + rotatedHW);
    maxY = Math.max(maxY, y + rotatedHH);
  }

  return { minX, minY, maxX, maxY };
}
