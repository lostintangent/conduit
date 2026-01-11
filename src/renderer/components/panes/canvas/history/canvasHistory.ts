/**
 * Canvas Undo/Redo History System
 *
 * Implements a command-based history pattern where each mutation is stored
 * as a reversible command. Commands capture both "before" and "after" states,
 * enabling clean undo/redo without complex inverse calculations.
 *
 * Architecture:
 * - Commands are immutable snapshots of state changes
 * - History is a pair of stacks (undo/redo)
 * - All functions are pure - no side effects
 */

import type { CanvasElement, Transform } from "@shared/types/canvas";
import {
  type CanvasHistoryState,
  EMPTY_HISTORY,
  MAX_HISTORY_SIZE,
} from "@/store/canvasStore";

// Re-export for consumers
export type { CanvasHistoryState };
export { EMPTY_HISTORY, MAX_HISTORY_SIZE };

// =============================================================================
// Types
// =============================================================================

/** 2D position */
export interface Position {
  x: number;
  y: number;
}

// =============================================================================
// Command Types
// =============================================================================

/**
 * Command for adding elements to the canvas.
 *
 * Undo: Remove the added elements
 * Redo: Add them back
 */
export interface AddElementsCommand {
  readonly type: "add-elements";
  readonly elements: readonly CanvasElement[];
}

/**
 * Command for deleting elements from the canvas.
 *
 * Undo: Restore elements at their original z-order positions
 * Redo: Remove them again
 */
export interface DeleteElementsCommand {
  readonly type: "delete-elements";
  readonly elements: readonly CanvasElement[];
  /** Original indices for z-order restoration */
  readonly indices: readonly number[];
}

/**
 * Command for moving elements.
 *
 * Undo: Restore original positions
 * Redo: Apply new positions
 */
export interface MoveElementsCommand {
  readonly type: "move-elements";
  readonly moves: ReadonlyMap<string, { before: Position; after: Position }>;
}

/**
 * Command for transforming an element (scale/rotate).
 *
 * Undo: Restore original transform
 * Redo: Apply new transform
 */
export interface TransformElementCommand {
  readonly type: "transform-element";
  readonly elementId: string;
  readonly before: Transform;
  readonly after: Transform;
}

/**
 * Command for clearing the entire canvas.
 *
 * Undo: Restore all elements
 * Redo: Clear again
 */
export interface ClearCanvasCommand {
  readonly type: "clear-canvas";
  readonly elements: readonly CanvasElement[];
}

/**
 * Style properties that can be changed on elements.
 */
export interface ElementStyle {
  readonly color?: string;
  readonly width?: number;
}

/**
 * Command for changing style properties of elements.
 *
 * Undo: Restore original styles
 * Redo: Apply new styles
 */
export interface StyleElementsCommand {
  readonly type: "style-elements";
  readonly changes: ReadonlyMap<
    string,
    { before: ElementStyle; after: ElementStyle }
  >;
}

/**
 * Shape size for line/arrow endpoint changes.
 */
export interface ShapeSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Command for dragging line/arrow endpoints.
 * This changes both transform (position, rotation) and size atomically.
 *
 * Undo: Restore original transform and size
 * Redo: Apply new transform and size
 */
export interface LineEndpointCommand {
  readonly type: "line-endpoint";
  readonly elementId: string;
  readonly before: { transform: Transform; size: ShapeSize };
  readonly after: { transform: Transform; size: ShapeSize };
}

/** Union of all command types */
export type CanvasCommand =
  | AddElementsCommand
  | DeleteElementsCommand
  | MoveElementsCommand
  | TransformElementCommand
  | ClearCanvasCommand
  | StyleElementsCommand
  | LineEndpointCommand;

// =============================================================================
// Command Creators
// =============================================================================

/**
 * Create a command for adding elements.
 */
export function addElements(elements: CanvasElement[]): AddElementsCommand {
  return {
    type: "add-elements",
    elements: elements.map((el) => structuredClone(el)),
  };
}

/**
 * Create a command for deleting elements.
 * Captures original indices for z-order restoration.
 */
export function deleteElements(
  elements: CanvasElement[],
  allElements: CanvasElement[],
): DeleteElementsCommand {
  return {
    type: "delete-elements",
    elements: elements.map((el) => structuredClone(el)),
    indices: elements.map((el) => allElements.findIndex((e) => e.id === el.id)),
  };
}

/**
 * Create a command for moving elements.
 * Returns null if no actual movement occurred.
 */
export function moveElements(
  moves: Map<string, { before: Position; after: Position }>,
): MoveElementsCommand | null {
  // Filter to only include actual movements
  const actualMoves = new Map<string, { before: Position; after: Position }>();

  for (const [id, { before, after }] of moves) {
    if (before.x !== after.x || before.y !== after.y) {
      actualMoves.set(id, { before: { ...before }, after: { ...after } });
    }
  }

  if (actualMoves.size === 0) return null;

  return {
    type: "move-elements",
    moves: actualMoves,
  };
}

/**
 * Create a command for transforming an element.
 * Returns null if transform didn't change.
 */
export function transformElement(
  elementId: string,
  before: Transform,
  after: Transform,
): TransformElementCommand | null {
  const unchanged =
    before.x === after.x &&
    before.y === after.y &&
    before.rotation === after.rotation &&
    before.scaleX === after.scaleX &&
    before.scaleY === after.scaleY;

  if (unchanged) return null;

  return {
    type: "transform-element",
    elementId,
    before: { ...before },
    after: { ...after },
  };
}

/**
 * Create a command for clearing the canvas.
 * Returns null if canvas was already empty.
 */
export function clearCanvas(
  elements: CanvasElement[],
): ClearCanvasCommand | null {
  if (elements.length === 0) return null;

  return {
    type: "clear-canvas",
    elements: elements.map((el) => structuredClone(el)),
  };
}

/**
 * Create a command for changing element styles.
 * Returns null if no actual style changes occurred.
 */
export function styleElements(
  changes: Map<string, { before: ElementStyle; after: ElementStyle }>,
): StyleElementsCommand | null {
  // Filter to only include actual changes
  const actualChanges = new Map<
    string,
    { before: ElementStyle; after: ElementStyle }
  >();

  for (const [id, { before, after }] of changes) {
    if (before.color !== after.color || before.width !== after.width) {
      actualChanges.set(id, {
        before: { ...before },
        after: { ...after },
      });
    }
  }

  if (actualChanges.size === 0) return null;

  return {
    type: "style-elements",
    changes: actualChanges,
  };
}

/**
 * Create a command for line/arrow endpoint dragging.
 * Returns null if nothing changed.
 */
export function lineEndpoint(
  elementId: string,
  before: { transform: Transform; size: ShapeSize },
  after: { transform: Transform; size: ShapeSize },
): LineEndpointCommand | null {
  const transformUnchanged =
    before.transform.x === after.transform.x &&
    before.transform.y === after.transform.y &&
    before.transform.rotation === after.transform.rotation &&
    before.transform.scaleX === after.transform.scaleX &&
    before.transform.scaleY === after.transform.scaleY;

  const sizeUnchanged =
    before.size.width === after.size.width &&
    before.size.height === after.size.height;

  if (transformUnchanged && sizeUnchanged) return null;

  return {
    type: "line-endpoint",
    elementId,
    before: {
      transform: { ...before.transform },
      size: { ...before.size },
    },
    after: {
      transform: { ...after.transform },
      size: { ...after.size },
    },
  };
}

// =============================================================================
// History Operations
// =============================================================================

/**
 * Push a command onto the undo stack.
 * Clears the redo stack (can't redo after a new action).
 */
export function push(
  history: CanvasHistoryState,
  command: CanvasCommand,
): CanvasHistoryState {
  const undoStack = [...history.undoStack, command];

  // Trim oldest if exceeds max size
  if (undoStack.length > MAX_HISTORY_SIZE) {
    undoStack.shift();
  }

  return { undoStack, redoStack: [] };
}

/**
 * Pop from undo stack, push to redo stack.
 * Returns null if nothing to undo.
 */
export function popUndo(
  history: CanvasHistoryState,
): { history: CanvasHistoryState; command: CanvasCommand } | null {
  if (history.undoStack.length === 0) return null;

  const command = history.undoStack[history.undoStack.length - 1];

  return {
    command,
    history: {
      undoStack: history.undoStack.slice(0, -1),
      redoStack: [...history.redoStack, command],
    },
  };
}

/**
 * Pop from redo stack, push to undo stack.
 * Returns null if nothing to redo.
 */
export function popRedo(
  history: CanvasHistoryState,
): { history: CanvasHistoryState; command: CanvasCommand } | null {
  if (history.redoStack.length === 0) return null;

  const command = history.redoStack[history.redoStack.length - 1];

  return {
    command,
    history: {
      undoStack: [...history.undoStack, command],
      redoStack: history.redoStack.slice(0, -1),
    },
  };
}

// =============================================================================
// Queries
// =============================================================================

export const canUndo = (h: CanvasHistoryState) => h.undoStack.length > 0;
export const canRedo = (h: CanvasHistoryState) => h.redoStack.length > 0;
