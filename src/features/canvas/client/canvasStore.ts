/**
 * Global store for canvas pane states.
 * State is stored outside the component, keyed by pane ID, so it survives
 * unmount/remount cycles (e.g., switching tabs, rearranging panes).
 */

import type { CanvasCommand } from "@features/canvas/components/history/canvasHistory";
import { clearImageCache } from "@features/canvas/components/render/elements";
import type { CanvasElement } from "@features/canvas/model";
import { createAtom } from "@/store/createAtom";
import type { Atom } from "@tanstack/react-store";

// =============================================================================
// Types
// =============================================================================

export interface ViewportState {
  zoom: number; // 1.0 = 100%
  panX: number; // Horizontal pan offset in canvas coordinates
  panY: number; // Vertical pan offset in canvas coordinates
}

/**
 * History state for undo/redo operations.
 */
export interface CanvasHistoryState {
  /** Commands that can be undone (most recent last) */
  readonly undoStack: readonly CanvasCommand[];
  /** Commands that can be redone (most recent last) */
  readonly redoStack: readonly CanvasCommand[];
}

/** Empty history state */
export const EMPTY_HISTORY: CanvasHistoryState = {
  undoStack: [],
  redoStack: [],
};

/** Maximum number of commands to retain in history */
export const MAX_HISTORY_SIZE = 50;

export interface CanvasState {
  backgroundColor: string;
  elements: CanvasElement[];
  selectedIds: string[];
  viewport: ViewportState;
  history: CanvasHistoryState;
  showDotGrid: boolean;
}

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_CANVAS_STATE: CanvasState = {
  backgroundColor: "#1a1a1a",
  elements: [],
  selectedIds: [],
  viewport: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  history: EMPTY_HISTORY,
  showDotGrid: true,
};

// =============================================================================
// Atom
// =============================================================================

/**
 * Per-pane canvas state atoms. Each pane subscribes only to its own atom,
 * so updates to one canvas don't trigger re-renders in other canvases.
 */
const canvasStateAtoms = new Map<string, Atom<CanvasState>>();

export function canvasStateAtomFamily(paneId: string): Atom<CanvasState> {
  let canvasStateAtom = canvasStateAtoms.get(paneId);
  if (!canvasStateAtom) {
    canvasStateAtom = createAtom<CanvasState>({ ...DEFAULT_CANVAS_STATE });
    canvasStateAtoms.set(paneId, canvasStateAtom);
  }
  return canvasStateAtom;
}

// =============================================================================
// Store Access
// =============================================================================

/**
 * Get the canvas state for a specific pane.
 */
export function getCanvasState(paneId: string): CanvasState {
  return canvasStateAtomFamily(paneId).get();
}

/**
 * Set the canvas state for a specific pane.
 */
export function setCanvasState(paneId: string, state: CanvasState): void {
  canvasStateAtomFamily(paneId).set(state);
}

/**
 * Update the canvas state for a specific pane using an updater function.
 */
export function updateCanvasState(
  paneId: string,
  updater: (state: CanvasState) => CanvasState,
): void {
  canvasStateAtomFamily(paneId).set(updater);
}

/**
 * Delete the canvas state for a specific pane.
 * Should be called when a canvas pane is closed.
 */
export function deleteCanvasState(paneId: string): void {
  // Clear image cache for all image elements in this pane
  const state = canvasStateAtomFamily(paneId).get();
  for (const element of state.elements) {
    if (element.type === "image") {
      clearImageCache(element.id);
    }
  }

  // Reset to default state and remove from family
  canvasStateAtoms.delete(paneId);
}

// =============================================================================
// Element Operations
// =============================================================================

/**
 * Add an element to a canvas pane.
 */
export function addElement(paneId: string, element: CanvasElement): void {
  updateCanvasState(paneId, (state) => ({
    ...state,
    elements: [...state.elements, element],
  }));
}

/**
 * Update an element in a canvas pane.
 */
export function updateElement(
  paneId: string,
  elementId: string,
  updates: Partial<CanvasElement>,
): void {
  updateCanvasState(paneId, (state) => ({
    ...state,
    elements: state.elements.map((el) =>
      el.id === elementId ? ({ ...el, ...updates } as CanvasElement) : el,
    ),
  }));
}

/**
 * Delete elements from a canvas pane.
 */
export function deleteElements(paneId: string, elementIds: string[]): void {
  // Clear image cache for deleted image elements
  const state = getCanvasState(paneId);
  for (const element of state.elements) {
    if (element.type === "image" && elementIds.includes(element.id)) {
      clearImageCache(element.id);
    }
  }

  updateCanvasState(paneId, (s) => ({
    ...s,
    elements: s.elements.filter((el) => !elementIds.includes(el.id)),
    selectedIds: s.selectedIds.filter((id) => !elementIds.includes(id)),
  }));
}

/**
 * Set the selected element IDs for a canvas pane.
 */
export function setSelectedIds(paneId: string, ids: string[]): void {
  updateCanvasState(paneId, (state) => ({
    ...state,
    selectedIds: ids,
  }));
}

/**
 * Clear all elements from a canvas pane.
 */
export function clearCanvas(paneId: string): void {
  // Clear image cache for all image elements
  const state = getCanvasState(paneId);
  for (const element of state.elements) {
    if (element.type === "image") {
      clearImageCache(element.id);
    }
  }

  updateCanvasState(paneId, (s) => ({
    ...s,
    elements: [],
    selectedIds: [],
  }));
}

/**
 * Update the viewport state for a canvas pane.
 */
export function setViewport(paneId: string, viewport: ViewportState): void {
  updateCanvasState(paneId, (state) => ({
    ...state,
    viewport,
  }));
}

/**
 * Migrate canvas state from one pane ID to another.
 * Used when locking/unlocking the sidebar to transfer content between
 * CWD-specific and global pane IDs.
 *
 * @param fromPaneId - Source pane ID to copy state from
 * @param toPaneId - Destination pane ID to copy state to
 * @param deleteSource - If true, delete the source state after copying
 */
export function migrateCanvasState(
  fromPaneId: string,
  toPaneId: string,
  deleteSource = false,
): void {
  const sourceState = canvasStateAtomFamily(fromPaneId).get();
  // Only migrate if source has content (not default state)
  if (
    sourceState.elements.length > 0 ||
    sourceState.history.undoStack.length > 0
  ) {
    setCanvasState(toPaneId, { ...sourceState });
    if (deleteSource) {
      // Don't use deleteCanvasState here as we don't want to clear image cache
      // (the images are still in use by the destination)
      canvasStateAtoms.delete(fromPaneId);
    }
  }
}
