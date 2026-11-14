/**
 * Canvas element types for the object-based canvas model.
 * Elements are discrete objects with transforms that can be selected, moved, resized, and rotated.
 */

// =============================================================================
// Geometry Primitives
// =============================================================================

/**
 * A 2D point in canvas coordinates.
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * A rectangle with position (top-left) and size.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Dimensions without position.
 */
export interface Size {
  width: number;
  height: number;
}

// =============================================================================
// Transform
// =============================================================================

/**
 * Transform applied to all element types.
 * Position is the center point of the element.
 */
export interface Transform {
  x: number; // Position X (center point)
  y: number; // Position Y (center point)
  rotation: number; // Rotation in degrees (0-360)
  scaleX: number; // Horizontal scale (1.0 = 100%)
  scaleY: number; // Vertical scale (1.0 = 100%)
}

// =============================================================================
// Base Element
// =============================================================================

/**
 * Base properties shared by all elements.
 */
interface BaseElement {
  id: string; // Unique identifier
  type: string; // Discriminator
  transform: Transform;
}

// =============================================================================
// Stroke Element
// =============================================================================

/**
 * A single point in a stroke with optional pressure for future stylus support.
 */
export interface StrokePoint {
  x: number;
  y: number;
  pressure?: number;
}

/**
 * Stroke element representing pen or eraser drawings.
 * Points are stored in canvas coordinates relative to the element's transform.
 */
export interface StrokeElement extends BaseElement {
  type: "stroke";
  points: StrokePoint[];
  style: {
    color: string; // Hex color
    width: number; // Stroke width in pixels
  };
  isEraser?: boolean; // If true, composites as eraser
}

// =============================================================================
// Text Element
// =============================================================================

/**
 * Text element for text annotations.
 */
export interface TextElement extends BaseElement {
  type: "text";
  content: string;
  style: {
    fontSize: number;
    fontFamily: string;
    color: string;
  };
  // Calculated bounding box for hit testing
  boundingBox: {
    width: number;
    height: number;
  };
}

// =============================================================================
// Image Element
// =============================================================================

/**
 * Image element for pasted images.
 * Images are stored as base64-encoded data for self-contained serialization.
 */
export interface ImageElement extends BaseElement {
  type: "image";
  // Base64-encoded image data (without data:image/...;base64, prefix)
  data: string;
  mimeType: string;
  originalSize: {
    width: number;
    height: number;
  };
}

// =============================================================================
// Shape Element
// =============================================================================

/**
 * Available shape types.
 */
export type ShapeType = "rectangle" | "ellipse" | "line" | "arrow";

/**
 * Fill pattern types for shapes.
 */
export type FillPattern = "solid" | "diagonal" | "cross" | "dots";

/**
 * Fill style for shapes (color + pattern).
 */
export interface FillStyle {
  color: string;
  pattern: FillPattern;
}

/**
 * Shape element for geometric primitives.
 * Size defines the bounding box; lines/arrows use width as length, height as thickness direction.
 */
export interface ShapeElement extends BaseElement {
  type: "shape";
  shapeType: ShapeType;
  size: { width: number; height: number };
  style: {
    color: string; // Stroke color (consistent with StrokeElement)
    width: number; // Stroke width in pixels (consistent with StrokeElement)
    fill?: FillStyle; // Optional fill (undefined = no fill)
  };
}

// =============================================================================
// Union Types
// =============================================================================

/**
 * All canvas element types.
 */
export type CanvasElement =
  StrokeElement | TextElement | ImageElement | ShapeElement;

/**
 * Available canvas tools.
 */
export type CanvasTool =
  "select" | "pen" | "eraser" | "text" | "hand" | "shape";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create a default transform centered at the given position.
 */
export function createTransform(x = 0, y = 0): Transform {
  return {
    x,
    y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  };
}

/**
 * Generate a unique element ID.
 */
export function generateElementId(): string {
  return `el_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// =============================================================================
// Element Factory Functions
// =============================================================================

/**
 * Create a stroke element from points.
 * Automatically calculates the center point and converts points to be relative.
 */
export function createStrokeElement(
  points: StrokePoint[],
  style: { color: string; width: number },
  isEraser = false,
): StrokeElement {
  // Calculate center point from all points
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const centerX = sumX / points.length;
  const centerY = sumY / points.length;

  // Convert points to be relative to center
  const relativePoints = points.map((p) => ({
    x: p.x - centerX,
    y: p.y - centerY,
    pressure: p.pressure,
  }));

  return {
    id: generateElementId(),
    type: "stroke",
    transform: createTransform(centerX, centerY),
    points: relativePoints,
    style,
    isEraser,
  };
}

/**
 * Create a text element at the specified position.
 */
export function createTextElement(
  content: string,
  x: number,
  y: number,
  style: { fontSize: number; fontFamily: string; color: string },
): TextElement {
  // Estimate bounding box (will be refined when rendered)
  const estimatedWidth = content.length * style.fontSize * 0.6;
  const estimatedHeight = style.fontSize * 1.2;

  return {
    id: generateElementId(),
    type: "text",
    transform: createTransform(x, y),
    content,
    style,
    boundingBox: {
      width: estimatedWidth,
      height: estimatedHeight,
    },
  };
}

/**
 * Create an image element from base64 data.
 */
export function createImageElement(
  data: string,
  mimeType: string,
  originalSize: { width: number; height: number },
  x: number,
  y: number,
): ImageElement {
  return {
    id: generateElementId(),
    type: "image",
    transform: createTransform(x, y),
    data,
    mimeType,
    originalSize,
  };
}

/**
 * Create a shape element.
 */
export function createShapeElement(
  shapeType: ShapeType,
  x: number,
  y: number,
  width: number,
  height: number,
  style: { color: string; width: number; fill?: FillStyle },
  rotation = 0,
): ShapeElement {
  return {
    id: generateElementId(),
    type: "shape",
    shapeType,
    transform: { ...createTransform(x, y), rotation },
    size: { width, height },
    style: {
      color: style.color,
      width: style.width,
      ...(style.fill && { fill: style.fill }),
    },
  };
}
