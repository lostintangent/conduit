/**
 * Hit testing utilities for canvas elements.
 * Used for selection and determining which element is under the cursor.
 */

import type {
  CanvasElement,
  ImageElement,
  Rect,
  ShapeElement,
  StrokeElement,
  TextElement,
} from "@shared/types/canvas";
import { getElementBounds } from "./renderElement";
import {
  type HandleType,
  type Point,
  HANDLE_SIZE,
  ROTATION_HANDLE_DISTANCE,
  ROTATION_HANDLE_RADIUS,
  distance,
  transformPointToCanvas,
  transformPointToLocal,
  transformPointToVisualLocal,
} from "./transformUtils";

// =============================================================================
// Types
// =============================================================================

/** Axis-aligned bounding box in world coordinates */
type AABB = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

// =============================================================================
// Helpers
// =============================================================================

/** Check if an element is selectable (excludes eraser strokes) */
function isSelectable(element: CanvasElement): boolean {
  return !(element.type === "stroke" && element.isEraser);
}

// =============================================================================
// Hit Test Functions
// =============================================================================

/**
 * Check if a point is within the bounding box of a stroke element.
 * Uses a simplified bounding box test rather than per-point distance.
 */
function hitTestStroke(point: Point, element: StrokeElement): boolean {
  if (element.points.length === 0) return false;

  const localPoint = transformPointToLocal(point, element.transform);
  const bounds = getElementBounds(element);

  // Check if point is within bounding box
  const halfWidth = bounds.width / 2;
  const halfHeight = bounds.height / 2;

  return (
    localPoint.x >= -halfWidth &&
    localPoint.x <= halfWidth &&
    localPoint.y >= -halfHeight &&
    localPoint.y <= halfHeight
  );
}

/**
 * Check if a point is within a text element's bounding box.
 */
function hitTestText(point: Point, element: TextElement): boolean {
  const localPoint = transformPointToLocal(point, element.transform);

  const halfWidth = element.boundingBox.width / 2;
  const halfHeight = element.boundingBox.height / 2;

  return (
    localPoint.x >= -halfWidth &&
    localPoint.x <= halfWidth &&
    localPoint.y >= -halfHeight &&
    localPoint.y <= halfHeight
  );
}

/**
 * Check if a point is within an image element's bounds.
 */
function hitTestImage(point: Point, element: ImageElement): boolean {
  const localPoint = transformPointToLocal(point, element.transform);

  const halfWidth = element.originalSize.width / 2;
  const halfHeight = element.originalSize.height / 2;

  return (
    localPoint.x >= -halfWidth &&
    localPoint.x <= halfWidth &&
    localPoint.y >= -halfHeight &&
    localPoint.y <= halfHeight
  );
}

/**
 * Check if a point is within a shape element's bounds.
 */
function hitTestShape(point: Point, element: ShapeElement): boolean {
  const localPoint = transformPointToLocal(point, element.transform);
  const bounds = getElementBounds(element);

  const halfWidth = bounds.width / 2;
  const halfHeight = bounds.height / 2;

  return (
    localPoint.x >= -halfWidth &&
    localPoint.x <= halfWidth &&
    localPoint.y >= -halfHeight &&
    localPoint.y <= halfHeight
  );
}

// =============================================================================
// Main Hit Test Function
// =============================================================================

/**
 * Check if a point hits an element.
 */
export function hitTestElement(point: Point, element: CanvasElement): boolean {
  switch (element.type) {
    case "stroke":
      return hitTestStroke(point, element);
    case "text":
      return hitTestText(point, element);
    case "image":
      return hitTestImage(point, element);
    case "shape":
      return hitTestShape(point, element);
  }
}

/**
 * Find the topmost element at a given point.
 * Elements are checked in reverse order (top to bottom in z-order).
 * Returns null if no element is hit.
 */
export function hitTestElements(
  point: Point,
  elements: CanvasElement[],
): CanvasElement | null {
  // Check in reverse order (last element = topmost)
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i];
    if (isSelectable(element) && hitTestElement(point, element)) {
      return element;
    }
  }
  return null;
}

/**
 * Find all elements at a given point.
 * Returns elements in z-order (first = bottom, last = top).
 */
export function hitTestAllElements(
  point: Point,
  elements: CanvasElement[],
): CanvasElement[] {
  return elements.filter((element) => hitTestElement(point, element));
}

/**
 * Get the axis-aligned bounding box (AABB) of an element in world coordinates.
 * Accounts for position, rotation, and scale transforms.
 */
function getElementAABB(element: CanvasElement): AABB {
  const bounds = getElementBounds(element);
  const { transform } = element;
  const halfW = bounds.width / 2;
  const halfH = bounds.height / 2;

  // Local corners (before any transform)
  const localCorners: Point[] = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ];

  // Transform to world space and find bounds
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const corner of localCorners) {
    const world = transformPointToCanvas(corner, transform);
    minX = Math.min(minX, world.x);
    minY = Math.min(minY, world.y);
    maxX = Math.max(maxX, world.x);
    maxY = Math.max(maxY, world.y);
  }

  return { minX, minY, maxX, maxY };
}

/** Check if two axis-aligned bounding boxes intersect */
function aabbIntersects(a: AABB, b: AABB): boolean {
  return (
    a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
  );
}

/** Convert a Rect to an AABB */
function rectToAABB(rect: Rect): AABB {
  return {
    minX: rect.x,
    minY: rect.y,
    maxX: rect.x + rect.width,
    maxY: rect.y + rect.height,
  };
}

/**
 * Find all elements that intersect with a selection rectangle.
 * Uses axis-aligned bounding box (AABB) intersection for efficiency.
 */
export function getElementsInRect(
  rect: Rect,
  elements: CanvasElement[],
): CanvasElement[] {
  const selectionAABB = rectToAABB(rect);
  return elements.filter(
    (element) =>
      isSelectable(element) &&
      aabbIntersects(selectionAABB, getElementAABB(element)),
  );
}

// =============================================================================
// Handle Hit Testing
// =============================================================================

/**
 * Check which handle (if any) is at a given point for a selected element.
 * Returns the handle type or null if no handle is hit.
 *
 * IMPORTANT: Handles are rendered in "visual local" coordinates - after
 * translate and rotate, but with scale applied manually to positions.
 * So we must use transformPointToVisualLocal (not transformPointToLocal)
 * to correctly match the rendered handle positions.
 *
 * @param point - Point in canvas coordinates
 * @param element - The selected element to check handles for
 * @param zoom - Current zoom level (handles have constant screen size)
 * @returns The handle type or null
 */
export function getHandleAtPoint(
  point: Point,
  element: CanvasElement,
  zoom: number,
): HandleType | null {
  // Check for line/arrow endpoint handles first
  if (
    element.type === "shape" &&
    (element.shapeType === "line" || element.shapeType === "arrow")
  ) {
    const { transform } = element;
    const localPoint = transformPointToVisualLocal(point, transform);

    // Endpoint positions in local coordinates (accounting for scale)
    const startX = (-element.size.width * transform.scaleX) / 2;
    const endX = (element.size.width * transform.scaleX) / 2;
    const y = 0;

    // Handle radius adjusted for zoom
    const handleRadius = HANDLE_SIZE / zoom / 2;
    const threshold = handleRadius + 2 / zoom;

    // Check start point
    if (distance(localPoint, { x: startX, y }) <= threshold) {
      return "line-start";
    }

    // Check end point
    if (distance(localPoint, { x: endX, y }) <= threshold) {
      return "line-end";
    }
  }

  const bounds = getElementBounds(element);
  const { transform } = element;

  // Transform point to visual local coordinates (translate + rotate, NO scale)
  // This matches how handles are rendered in renderSelectionHandles
  const localPoint = transformPointToVisualLocal(point, transform);

  // Scaled half-dimensions (handles are drawn at scaled positions)
  const halfWidth = (bounds.width * transform.scaleX) / 2;
  const halfHeight = (bounds.height * transform.scaleY) / 2;

  // Handle sizes adjusted for zoom (handles appear constant on screen)
  const handleSize = HANDLE_SIZE / zoom;
  const rotationDistance = ROTATION_HANDLE_DISTANCE / zoom;
  const rotationRadius = ROTATION_HANDLE_RADIUS / zoom;

  // Check rotation handle first (it's outside the bounding box)
  const rotationHandlePos = { x: 0, y: -halfHeight - rotationDistance };
  if (distance(localPoint, rotationHandlePos) <= rotationRadius + 2 / zoom) {
    return "rotate";
  }

  // Check corner handles
  const corners: Array<{ x: number; y: number; type: HandleType }> = [
    { x: -halfWidth, y: -halfHeight, type: "resize-tl" },
    { x: halfWidth, y: -halfHeight, type: "resize-tr" },
    { x: halfWidth, y: halfHeight, type: "resize-br" },
    { x: -halfWidth, y: halfHeight, type: "resize-bl" },
  ];

  for (const corner of corners) {
    if (
      Math.abs(localPoint.x - corner.x) <= handleSize / 2 + 2 / zoom &&
      Math.abs(localPoint.y - corner.y) <= handleSize / 2 + 2 / zoom
    ) {
      return corner.type;
    }
  }

  // Check if point is inside the element body (for move)
  if (hitTestElement(point, element)) {
    return "move";
  }

  return null;
}
