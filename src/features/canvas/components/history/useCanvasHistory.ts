/**
 * React hook for canvas undo/redo history.
 *
 * This hook encapsulates all history management logic, including command
 * application. The consumer simply calls record* functions after mutations
 * and undo/redo to reverse them - no need to understand command internals.
 *
 * Design:
 * - History is stored in a global store atom keyed by pane ID
 * - Operations interface decouples from canvas state implementation
 * - Command application is handled internally
 */

import {
  type CanvasHistoryState,
  EMPTY_HISTORY,
  canvasStateAtomFamily,
} from "@features/canvas/client/canvasStore";
import type { CanvasElement, Transform } from "@features/canvas/model";
import { useAtom } from "@tanstack/react-store";
import { useCallback } from "react";
import {
  type CanvasCommand,
  type ElementStyle,
  type Position,
  type ShapeSize,
  addElements,
  canRedo,
  canUndo,
  clearCanvas,
  deleteElements,
  lineEndpoint,
  moveElements,
  popRedo,
  popUndo,
  push,
  styleElements,
  transformElement,
} from "./canvasHistory";

// =============================================================================
// Types
// =============================================================================

/**
 * Canvas operations interface.
 * The hook calls these when applying undo/redo commands.
 */
export interface CanvasOperations {
  /** Add a single element */
  addElement: (element: CanvasElement) => void;
  /** Remove elements by ID */
  deleteElements: (ids: string[]) => void;
  /** Update only position (preserves rotation/scale) - for move undo/redo */
  updateElementPosition: (id: string, x: number, y: number) => void;
  /** Update full transform - for transform undo/redo */
  updateElementTransform: (id: string, transform: Transform) => void;
  /** Update element style (color/width) - for style undo/redo */
  updateElementStyle: (id: string, style: ElementStyle) => void;
  /** Replace all elements - for undo clear */
  setElements: (elements: CanvasElement[]) => void;
  /** Add elements at indices - for undo delete */
  addElementsAtIndices: (
    items: Array<{ element: CanvasElement; index: number }>,
  ) => void;
  /** Clear all elements - for redo clear */
  clearCanvas: () => void;
  /** Update line/arrow endpoint (transform + size) - for endpoint undo/redo */
  updateLineEndpoint: (
    id: string,
    transform: Transform,
    size: ShapeSize,
  ) => void;
}

export interface UseCanvasHistoryOptions {
  paneId: string;
  operations: CanvasOperations;
}

export interface UseCanvasHistoryResult {
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;

  /** Record adding elements */
  recordAdd: (elements: CanvasElement[]) => void;
  /** Record deleting elements (pass allElements for z-order tracking) */
  recordDelete: (
    elements: CanvasElement[],
    allElements: CanvasElement[],
  ) => void;
  /** Record moving elements */
  recordMove: (
    moves: Map<string, { before: Position; after: Position }>,
  ) => void;
  /** Record transforming an element */
  recordTransform: (
    elementId: string,
    before: Transform,
    after: Transform,
  ) => void;
  /** Record style changes */
  recordStyle: (
    changes: Map<string, { before: ElementStyle; after: ElementStyle }>,
  ) => void;
  /** Record clearing the canvas */
  recordClear: (elements: CanvasElement[]) => void;
  /** Record line/arrow endpoint change (transform + size) */
  recordLineEndpoint: (
    elementId: string,
    before: { transform: Transform; size: ShapeSize },
    after: { transform: Transform; size: ShapeSize },
  ) => void;

  /** Undo the last action */
  undo: () => void;
  /** Redo the last undone action */
  redo: () => void;

  /** Clear all history */
  clearHistory: () => void;
}

// =============================================================================
// Command Application
// =============================================================================

function applyUndo(command: CanvasCommand, ops: CanvasOperations): void {
  switch (command.type) {
    case "add-elements":
      ops.deleteElements(command.elements.map((el) => el.id));
      break;

    case "delete-elements":
      ops.addElementsAtIndices(
        command.elements.map((el, i) => ({
          element: el as CanvasElement,
          index: command.indices[i],
        })),
      );
      break;

    case "move-elements":
      for (const [id, { before }] of command.moves) {
        ops.updateElementPosition(id, before.x, before.y);
      }
      break;

    case "transform-element":
      ops.updateElementTransform(command.elementId, command.before);
      break;

    case "clear-canvas":
      ops.setElements(command.elements as CanvasElement[]);
      break;

    case "style-elements":
      for (const [id, { before }] of command.changes) {
        ops.updateElementStyle(id, before);
      }
      break;

    case "line-endpoint":
      ops.updateLineEndpoint(
        command.elementId,
        command.before.transform,
        command.before.size,
      );
      break;
  }
}

function applyRedo(command: CanvasCommand, ops: CanvasOperations): void {
  switch (command.type) {
    case "add-elements":
      for (const el of command.elements) {
        ops.addElement(el as CanvasElement);
      }
      break;

    case "delete-elements":
      ops.deleteElements(command.elements.map((el) => el.id));
      break;

    case "move-elements":
      for (const [id, { after }] of command.moves) {
        ops.updateElementPosition(id, after.x, after.y);
      }
      break;

    case "transform-element":
      ops.updateElementTransform(command.elementId, command.after);
      break;

    case "clear-canvas":
      ops.clearCanvas();
      break;

    case "style-elements":
      for (const [id, { after }] of command.changes) {
        ops.updateElementStyle(id, after);
      }
      break;

    case "line-endpoint":
      ops.updateLineEndpoint(
        command.elementId,
        command.after.transform,
        command.after.size,
      );
      break;
  }
}

// =============================================================================
// Hook
// =============================================================================

export function useCanvasHistory({
  paneId,
  operations,
}: UseCanvasHistoryOptions): UseCanvasHistoryResult {
  // Subscribe only to this pane's atom (other panes' updates won't trigger re-render)
  const [canvasState, setCanvasState] = useAtom(canvasStateAtomFamily(paneId));
  const history = canvasState.history;

  const updateHistory = useCallback(
    (fn: (h: CanvasHistoryState) => CanvasHistoryState) => {
      setCanvasState((state) => ({
        ...state,
        history: fn(state.history),
      }));
    },
    [setCanvasState],
  );

  // ---------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------

  const recordAdd = useCallback(
    (elements: CanvasElement[]) => {
      if (elements.length === 0) return;
      updateHistory((h) => push(h, addElements(elements)));
    },
    [updateHistory],
  );

  const recordDelete = useCallback(
    (elements: CanvasElement[], allElements: CanvasElement[]) => {
      if (elements.length === 0) return;
      updateHistory((h) => push(h, deleteElements(elements, allElements)));
    },
    [updateHistory],
  );

  const recordMove = useCallback(
    (moves: Map<string, { before: Position; after: Position }>) => {
      const command = moveElements(moves);
      if (command) updateHistory((h) => push(h, command));
    },
    [updateHistory],
  );

  const recordTransform = useCallback(
    (elementId: string, before: Transform, after: Transform) => {
      const command = transformElement(elementId, before, after);
      if (command) updateHistory((h) => push(h, command));
    },
    [updateHistory],
  );

  const recordStyle = useCallback(
    (changes: Map<string, { before: ElementStyle; after: ElementStyle }>) => {
      const command = styleElements(changes);
      if (command) updateHistory((h) => push(h, command));
    },
    [updateHistory],
  );

  const recordClear = useCallback(
    (elements: CanvasElement[]) => {
      const command = clearCanvas(elements);
      if (command) updateHistory((h) => push(h, command));
    },
    [updateHistory],
  );

  const recordLineEndpoint = useCallback(
    (
      elementId: string,
      before: { transform: Transform; size: ShapeSize },
      after: { transform: Transform; size: ShapeSize },
    ) => {
      const command = lineEndpoint(elementId, before, after);
      if (command) updateHistory((h) => push(h, command));
    },
    [updateHistory],
  );

  // ---------------------------------------------------------------------------
  // Undo/Redo
  // ---------------------------------------------------------------------------

  const undo = useCallback(() => {
    const result = popUndo(canvasState.history);
    if (!result) return;

    setCanvasState((state) => ({ ...state, history: result.history }));
    applyUndo(result.command, operations);
  }, [canvasState.history, setCanvasState, operations]);

  const redo = useCallback(() => {
    const result = popRedo(canvasState.history);
    if (!result) return;

    setCanvasState((state) => ({ ...state, history: result.history }));
    applyRedo(result.command, operations);
  }, [canvasState.history, setCanvasState, operations]);

  const clearHistoryFn = useCallback(() => {
    updateHistory(() => EMPTY_HISTORY);
  }, [updateHistory]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    recordAdd,
    recordDelete,
    recordMove,
    recordTransform,
    recordStyle,
    recordClear,
    recordLineEndpoint,
    undo,
    redo,
    clearHistory: clearHistoryFn,
  };
}
