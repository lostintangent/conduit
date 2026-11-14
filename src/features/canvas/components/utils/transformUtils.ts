/**
 * Transform utilities for canvas element manipulation.
 * Provides math helpers for resize and rotation operations.
 */

import type { CanvasElement, Point } from "@features/canvas/model";

// Re-export Point for convenience
export type { Point };

// =============================================================================
// Types
// =============================================================================

export type HandleType =
  | "move"
  | "resize-tl"
  | "resize-tr"
  | "resize-br"
  | "resize-bl"
  | "rotate"
  | "line-start"
  | "line-end";

// =============================================================================
// Constants
// =============================================================================

/** Size of resize handles in pixels (at zoom level 1.0) */
export const HANDLE_SIZE = 8;

/** Distance of rotation handle from element top (at zoom level 1.0) */
export const ROTATION_HANDLE_DISTANCE = 24;

/** Radius of the rotation handle circle */
export const ROTATION_HANDLE_RADIUS = 5;

// =============================================================================
// Coordinate Transform Utilities
// =============================================================================

/**
 * Transform a point from canvas coordinates to element-local coordinates.
 * This applies the inverse of the element's transform (translation, rotation, scale).
 */
export function transformPointToLocal(
  point: Point,
  transform: CanvasElement["transform"],
): Point {
  // Translate to element origin
  const dx = point.x - transform.x;
  const dy = point.y - transform.y;

  // Inverse rotation
  const rad = (-transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotatedX = dx * cos - dy * sin;
  const rotatedY = dx * sin + dy * cos;

  // Inverse scale
  return {
    x: rotatedX / transform.scaleX,
    y: rotatedY / transform.scaleY,
  };
}

/**
 * Transform a point from element-local coordinates to canvas coordinates.
 * This applies the element's transform (scale, rotation, translation).
 */
export function transformPointToCanvas(
  localPoint: Point,
  transform: CanvasElement["transform"],
): Point {
  // Apply scale
  const scaledX = localPoint.x * transform.scaleX;
  const scaledY = localPoint.y * transform.scaleY;

  // Apply rotation
  const rad = (transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotatedX = scaledX * cos - scaledY * sin;
  const rotatedY = scaledX * sin + scaledY * cos;

  // Apply translation
  return {
    x: rotatedX + transform.x,
    y: rotatedY + transform.y,
  };
}

// =============================================================================
// Distance & Angle Utilities
// =============================================================================

/**
 * Calculate the distance between two points.
 */
export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate the angle in degrees from p1 to p2.
 * 0 degrees is to the right, 90 degrees is down.
 */
export function angleBetween(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

/**
 * Normalize an angle to be within 0-360 degrees.
 */
export function normalizeAngle(angle: number): number {
  let normalized = angle % 360;
  if (normalized < 0) normalized += 360;
  return normalized;
}

/**
 * Transform a point from canvas coordinates to "visual local" coordinates.
 * Applies inverse translation and rotation only (NOT inverse scale).
 * Used for handle hit testing where handles are drawn at scaled positions.
 */
export function transformPointToVisualLocal(
  point: Point,
  transform: CanvasElement["transform"],
): Point {
  // Translate to element origin
  const dx = point.x - transform.x;
  const dy = point.y - transform.y;

  // Inverse rotation only (no scale - handles are at scaled positions)
  const rad = (-transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos,
  };
}

// =============================================================================
// Resize Calculation Utilities
// =============================================================================

/**
 * Calculate the new scale factor based on a resize drag operation.
 * Uses uniform scaling to maintain aspect ratio.
 *
 * The scale is calculated based on the ratio of:
 * - Current distance from element center to drag point
 * - Original distance from element center to corner
 *
 * This ensures the corner handle follows the mouse radially.
 *
 * @param dragPoint - Current mouse position in canvas coordinates
 * @param elementCenter - Element center in canvas coordinates
 * @param originalBounds - Original element bounds (width, height) at drag start
 * @param originalScale - Original scale factors at drag start
 * @param rotation - Current element rotation in degrees
 * @returns New scale factors
 */
export function calculateResizeScale(
  dragPoint: Point,
  elementCenter: Point,
  originalBounds: { width: number; height: number },
  originalScale: { scaleX: number; scaleY: number },
  rotation: number,
): { scaleX: number; scaleY: number } {
  // Transform drag point to local coordinates (rotation only, not scale)
  // This matches the coordinate system where handles are rendered
  const dx = dragPoint.x - elementCenter.x;
  const dy = dragPoint.y - elementCenter.y;

  const rad = (-rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  // Distance from center to drag point
  const currentDistance = Math.sqrt(localX * localX + localY * localY);

  // Distance from center to corner at drag start
  const originalHalfWidth = (originalBounds.width * originalScale.scaleX) / 2;
  const originalHalfHeight = (originalBounds.height * originalScale.scaleY) / 2;
  const originalDistance = Math.sqrt(
    originalHalfWidth * originalHalfWidth +
      originalHalfHeight * originalHalfHeight,
  );

  // Scale factor = how much further/closer the mouse is compared to start
  const scaleFactor =
    originalDistance > 0 ? currentDistance / originalDistance : 1;

  // Apply minimum scale to prevent collapsing/flipping
  const minScale = 0.1;
  const newScaleX = Math.max(minScale, originalScale.scaleX * scaleFactor);
  const newScaleY = Math.max(minScale, originalScale.scaleY * scaleFactor);

  return { scaleX: newScaleX, scaleY: newScaleY };
}

/**
 * Calculate the new rotation angle based on a rotate drag operation.
 *
 * @param dragPoint - Current mouse position in canvas coordinates
 * @param elementCenter - Element center in canvas coordinates
 * @returns New rotation angle in degrees
 */
export function calculateRotation(
  dragPoint: Point,
  elementCenter: Point,
): number {
  // Calculate angle from element center to drag point
  // The rotation handle is above the element, so we add 90 degrees
  const angle = angleBetween(elementCenter, dragPoint) + 90;
  return normalizeAngle(angle);
}

// =============================================================================
// Cursor Utilities
// =============================================================================

/**
 * Get the appropriate cursor style for a handle type.
 * For resize handles, the cursor rotates based on element rotation.
 */
export function getCursorForHandle(
  handleType: HandleType | null,
  rotation = 0,
): string {
  if (!handleType) return "default";

  switch (handleType) {
    case "move":
      return "move";
    case "rotate":
      return "grab";
    case "line-start":
    case "line-end":
      return "move";
    case "resize-tl":
    case "resize-br": {
      // These are on the nwse diagonal
      const adjustedRotation = normalizeAngle(rotation);
      if (adjustedRotation >= 337.5 || adjustedRotation < 22.5)
        return "nwse-resize";
      if (adjustedRotation >= 22.5 && adjustedRotation < 67.5)
        return "ns-resize";
      if (adjustedRotation >= 67.5 && adjustedRotation < 112.5)
        return "nesw-resize";
      if (adjustedRotation >= 112.5 && adjustedRotation < 157.5)
        return "ew-resize";
      if (adjustedRotation >= 157.5 && adjustedRotation < 202.5)
        return "nwse-resize";
      if (adjustedRotation >= 202.5 && adjustedRotation < 247.5)
        return "ns-resize";
      if (adjustedRotation >= 247.5 && adjustedRotation < 292.5)
        return "nesw-resize";
      return "ew-resize";
    }
    case "resize-tr":
    case "resize-bl": {
      // These are on the nesw diagonal
      const adjustedRotation = normalizeAngle(rotation);
      if (adjustedRotation >= 337.5 || adjustedRotation < 22.5)
        return "nesw-resize";
      if (adjustedRotation >= 22.5 && adjustedRotation < 67.5)
        return "ew-resize";
      if (adjustedRotation >= 67.5 && adjustedRotation < 112.5)
        return "nwse-resize";
      if (adjustedRotation >= 112.5 && adjustedRotation < 157.5)
        return "ns-resize";
      if (adjustedRotation >= 157.5 && adjustedRotation < 202.5)
        return "nesw-resize";
      if (adjustedRotation >= 202.5 && adjustedRotation < 247.5)
        return "ew-resize";
      if (adjustedRotation >= 247.5 && adjustedRotation < 292.5)
        return "nwse-resize";
      return "ns-resize";
    }
    default:
      return "default";
  }
}
