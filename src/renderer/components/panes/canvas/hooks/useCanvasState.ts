/**
 * Hook to access and modify canvas state for a specific pane.
 * Provides convenience methods for common operations.
 */

import {
  canvasStateAtomFamily,
  addElement as storeAddElement,
  clearCanvas as storeClearCanvas,
  deleteElements as storeDeleteElements,
  setSelectedIds as storeSetSelectedIds,
  updateElement as storeUpdateElement,
  updateCanvasState,
} from "@/store/canvasStore";
import type { CanvasElement, FillStyle } from "@shared/types/canvas";
import { useAtomValue } from "jotai";
import { useCallback } from "react";

// =============================================================================
// Hook
// =============================================================================

export function useCanvasState(paneId: string) {
  // Subscribe only to this pane's atom (other panes' updates won't trigger re-render)
  const state = useAtomValue(canvasStateAtomFamily(paneId));

  // ---------------------------------------------------------------------------
  // Element Operations
  // ---------------------------------------------------------------------------

  const addElement = useCallback(
    (element: CanvasElement) => {
      storeAddElement(paneId, element);
    },
    [paneId],
  );

  const updateElement = useCallback(
    (elementId: string, updates: Partial<CanvasElement>) => {
      storeUpdateElement(paneId, elementId, updates);
    },
    [paneId],
  );

  const deleteElements = useCallback(
    (elementIds: string[]) => {
      storeDeleteElements(paneId, elementIds);
    },
    [paneId],
  );

  const deleteSelectedElements = useCallback(() => {
    if (state.selectedIds.length > 0) {
      storeDeleteElements(paneId, state.selectedIds);
    }
  }, [paneId, state.selectedIds]);

  // ---------------------------------------------------------------------------
  // Selection Operations
  // ---------------------------------------------------------------------------

  const selectElements = useCallback(
    (ids: string[]) => {
      storeSetSelectedIds(paneId, ids);
    },
    [paneId],
  );

  const clearSelection = useCallback(() => {
    storeSetSelectedIds(paneId, []);
  }, [paneId]);

  // ---------------------------------------------------------------------------
  // Canvas Operations
  // ---------------------------------------------------------------------------

  const clearCanvas = useCallback(() => {
    storeClearCanvas(paneId);
  }, [paneId]);

  /**
   * Set the entire elements array directly (used for undo/redo).
   */
  const setElements = useCallback(
    (newElements: CanvasElement[]) => {
      updateCanvasState(paneId, (s) => ({
        ...s,
        elements: newElements,
      }));
    },
    [paneId],
  );

  /**
   * Add elements at specific indices (used for undoing delete operations).
   * Restores elements to their original z-order positions.
   */
  const addElementsAtIndices = useCallback(
    (elementsWithIndices: Array<{ element: CanvasElement; index: number }>) => {
      updateCanvasState(paneId, (s) => {
        const newElements = [...s.elements];
        // Sort by index to insert in correct order
        const sorted = [...elementsWithIndices].sort(
          (a, b) => a.index - b.index,
        );
        for (const { element, index } of sorted) {
          const insertIndex = Math.min(index, newElements.length);
          newElements.splice(insertIndex, 0, element);
        }
        return { ...s, elements: newElements };
      });
    },
    [paneId],
  );

  /**
   * Update only the position (x, y) of an element's transform.
   * Preserves rotation and scale. Used for undo/redo of move operations.
   */
  const updateElementPosition = useCallback(
    (elementId: string, x: number, y: number) => {
      updateCanvasState(paneId, (s) => ({
        ...s,
        elements: s.elements.map((el) =>
          el.id === elementId
            ? { ...el, transform: { ...el.transform, x, y } }
            : el,
        ),
      }));
    },
    [paneId],
  );

  /**
   * Update style properties (color, width, fill) of an element.
   * Only applies to elements that have a style property (stroke, text, shape).
   * Note: TextElement only has color, not width or fill.
   * Note: StrokeElement has color and width, but not fill.
   * Note: ShapeElement has color, width, and optionally fill (for rect/ellipse).
   */
  const updateElementStyle = useCallback(
    (
      elementId: string,
      style: { color?: string; width?: number; fill?: FillStyle | undefined },
    ) => {
      updateCanvasState(paneId, (s) => ({
        ...s,
        elements: s.elements.map((el) => {
          if (el.id !== elementId) return el;

          // Handle each element type appropriately
          switch (el.type) {
            case "stroke":
              // Strokes have color and width, but not fill
              return {
                ...el,
                style: {
                  ...el.style,
                  ...(style.color !== undefined && { color: style.color }),
                  ...(style.width !== undefined && { width: style.width }),
                },
              };
            case "shape":
              // Shapes have color, width, and optionally fill
              return {
                ...el,
                style: {
                  ...el.style,
                  ...(style.color !== undefined && { color: style.color }),
                  ...(style.width !== undefined && { width: style.width }),
                  // Handle fill: can be set to a FillStyle or explicitly to undefined (no fill)
                  ...("fill" in style && { fill: style.fill }),
                },
              };
            case "text":
              // Text only has color (and fontSize/fontFamily, but not width or fill)
              if (style.color !== undefined) {
                return {
                  ...el,
                  style: {
                    ...el.style,
                    color: style.color,
                  },
                };
              }
              return el;
            default:
              // Image elements don't have style
              return el;
          }
        }),
      }));
    },
    [paneId],
  );

  const setBackgroundColor = useCallback(
    (color: string) => {
      updateCanvasState(paneId, (s) => ({
        ...s,
        backgroundColor: color,
      }));
    },
    [paneId],
  );

  const toggleDotGrid = useCallback(() => {
    updateCanvasState(paneId, (s) => ({
      ...s,
      showDotGrid: !s.showDotGrid,
    }));
  }, [paneId]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // State
    elements: state.elements,
    selectedIds: state.selectedIds,
    backgroundColor: state.backgroundColor,
    showDotGrid: state.showDotGrid,

    // Element operations
    addElement,
    updateElement,
    deleteElements,
    deleteSelectedElements,

    // Selection operations
    selectElements,
    clearSelection,

    // Canvas operations
    clearCanvas,
    setBackgroundColor,
    toggleDotGrid,
    setElements,
    addElementsAtIndices,
    updateElementPosition,
    updateElementStyle,
  };
}
