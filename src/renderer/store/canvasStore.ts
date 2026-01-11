/**
 * Global store for canvas pane states.
 * State is stored outside the component, keyed by pane ID, so it survives
 * unmount/remount cycles (e.g., switching tabs, rearranging panes).
 */

import { clearImageCache } from "@/components/panes/canvas/utils/renderElement";
import type { CanvasCommand } from "@/components/panes/canvas/history/canvasHistory";
import type { CanvasElement } from "@shared/types/canvas";
import { atom, getDefaultStore } from "jotai";

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
};

// =============================================================================
// Atom
// =============================================================================

/**
 * Map of paneId -> CanvasState
 * Using a Map allows efficient lookup and update of individual pane states.
 */
export const canvasStatesAtom = atom<Map<string, CanvasState>>(new Map());

// =============================================================================
// Store Access
// =============================================================================

const store = getDefaultStore();

/**
 * Get the canvas state for a specific pane.
 * Returns a copy of the default state if no state exists for the pane.
 */
export function getCanvasState(paneId: string): CanvasState {
  const state = store.get(canvasStatesAtom).get(paneId);
  return state ?? { ...DEFAULT_CANVAS_STATE };
}

/**
 * Set the canvas state for a specific pane.
 */
export function setCanvasState(paneId: string, state: CanvasState): void {
  store.set(canvasStatesAtom, (current) => {
    const next = new Map(current);
    next.set(paneId, state);
    return next;
  });
}

/**
 * Update the canvas state for a specific pane using an updater function.
 */
export function updateCanvasState(
  paneId: string,
  updater: (state: CanvasState) => CanvasState,
): void {
  const current = getCanvasState(paneId);
  setCanvasState(paneId, updater(current));
}

/**
 * Delete the canvas state for a specific pane.
 * Should be called when a canvas pane is closed.
 */
export function deleteCanvasState(paneId: string): void {
  // Clear image cache for all image elements in this pane
  const state = store.get(canvasStatesAtom).get(paneId);
  if (state) {
    for (const element of state.elements) {
      if (element.type === "image") {
        clearImageCache(element.id);
      }
    }
  }

  store.set(canvasStatesAtom, (current) => {
    const next = new Map(current);
    next.delete(paneId);
    return next;
  });
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
