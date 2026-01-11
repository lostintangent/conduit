/**
 * Canvas undo/redo history system.
 *
 * Exports the main hook and types for managing canvas history.
 */

export { useCanvasHistory } from "./useCanvasHistory";
export type {
  CanvasOperations,
  UseCanvasHistoryOptions,
  UseCanvasHistoryResult,
} from "./useCanvasHistory";

export type {
  Position,
  ElementStyle,
  ShapeSize,
  CanvasCommand,
  CanvasHistoryState,
  AddElementsCommand,
  DeleteElementsCommand,
  MoveElementsCommand,
  TransformElementCommand,
  ClearCanvasCommand,
  StyleElementsCommand,
  LineEndpointCommand,
} from "./canvasHistory";

export {
  MAX_HISTORY_SIZE,
  EMPTY_HISTORY,
  canUndo,
  canRedo,
} from "./canvasHistory";
