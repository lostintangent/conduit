import {
  type ViewportState,
  canvasStateAtomFamily,
  setViewport as storeSetViewport,
} from "@/store/canvasStore";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { type Point } from "../utils/transformUtils";

// =============================================================================
// Constants
// =============================================================================

export const MIN_ZOOM = 0.1; // 10%
export const MAX_ZOOM = 10; // 1000%
const ZOOM_STEP = 1.1; // 10% per step

// =============================================================================
// Hook
// =============================================================================

export function useViewport(paneId: string) {
  // Subscribe only to this pane's atom (other panes' updates won't trigger re-render)
  const { viewport } = useAtomValue(canvasStateAtomFamily(paneId));

  // Update viewport in the global store
  const setViewport = useCallback(
    (newViewport: ViewportState) => storeSetViewport(paneId, newViewport),
    [paneId],
  );

  // ---------------------------------------------------------------------------
  // Coordinate transformation: screen (mouse) -> canvas
  // ---------------------------------------------------------------------------
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number, canvasRect: DOMRect): Point => {
      // Get position relative to canvas element
      const relX = screenX - canvasRect.left;
      const relY = screenY - canvasRect.top;

      // Apply inverse viewport transform
      return {
        x: relX / viewport.zoom - viewport.panX,
        y: relY / viewport.zoom - viewport.panY,
      };
    },
    [viewport],
  );

  // ---------------------------------------------------------------------------
  // Coordinate transformation: canvas -> screen
  // ---------------------------------------------------------------------------
  const canvasToScreen = useCallback(
    (canvasX: number, canvasY: number, canvasRect: DOMRect): Point => {
      return {
        x: (canvasX + viewport.panX) * viewport.zoom + canvasRect.left,
        y: (canvasY + viewport.panY) * viewport.zoom + canvasRect.top,
      };
    },
    [viewport],
  );

  // ---------------------------------------------------------------------------
  // Zoom centered on a specific point (in screen coordinates)
  // ---------------------------------------------------------------------------
  const zoomAtPoint = useCallback(
    (
      newZoom: number,
      screenX: number,
      screenY: number,
      canvasRect: DOMRect,
    ) => {
      // Clamp zoom
      const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

      // Get canvas point under mouse before zoom
      const relX = screenX - canvasRect.left;
      const relY = screenY - canvasRect.top;
      const canvasX = relX / viewport.zoom - viewport.panX;
      const canvasY = relY / viewport.zoom - viewport.panY;

      // Calculate new pan so the same canvas point stays under the mouse
      const newPanX = relX / clampedZoom - canvasX;
      const newPanY = relY / clampedZoom - canvasY;

      setViewport({
        zoom: clampedZoom,
        panX: newPanX,
        panY: newPanY,
      });
    },
    [viewport, setViewport],
  );

  // ---------------------------------------------------------------------------
  // Zoom in/out by step (centered on canvas center)
  // ---------------------------------------------------------------------------
  const zoomIn = useCallback(
    (canvasRect: DOMRect) => {
      const centerX = canvasRect.left + canvasRect.width / 2;
      const centerY = canvasRect.top + canvasRect.height / 2;
      zoomAtPoint(viewport.zoom * ZOOM_STEP, centerX, centerY, canvasRect);
    },
    [viewport.zoom, zoomAtPoint],
  );

  const zoomOut = useCallback(
    (canvasRect: DOMRect) => {
      const centerX = canvasRect.left + canvasRect.width / 2;
      const centerY = canvasRect.top + canvasRect.height / 2;
      zoomAtPoint(viewport.zoom / ZOOM_STEP, centerX, centerY, canvasRect);
    },
    [viewport.zoom, zoomAtPoint],
  );

  // ---------------------------------------------------------------------------
  // Reset zoom to 100% centered
  // ---------------------------------------------------------------------------
  const resetZoom = useCallback(() => {
    setViewport({
      zoom: 1,
      panX: 0,
      panY: 0,
    });
  }, [setViewport]);

  // ---------------------------------------------------------------------------
  // Zoom to fit all content within the viewport
  // ---------------------------------------------------------------------------
  const zoomToFit = useCallback(
    (
      contentBounds: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
      } | null,
      canvasWidth: number,
      canvasHeight: number,
    ) => {
      // No content - reset to default view
      if (!contentBounds) {
        resetZoom();
        return;
      }

      const contentWidth = contentBounds.maxX - contentBounds.minX;
      const contentHeight = contentBounds.maxY - contentBounds.minY;

      // Handle edge case of zero-size content
      if (contentWidth <= 0 || contentHeight <= 0) {
        resetZoom();
        return;
      }

      // Add 5% padding on each side
      const padding = 0.9; // Show content at 90% of viewport
      const zoomX = (canvasWidth * padding) / contentWidth;
      const zoomY = (canvasHeight * padding) / contentHeight;
      const newZoom = Math.min(zoomX, zoomY, MAX_ZOOM);
      const clampedZoom = Math.max(MIN_ZOOM, newZoom);

      // Center content in viewport
      const contentCenterX = (contentBounds.minX + contentBounds.maxX) / 2;
      const contentCenterY = (contentBounds.minY + contentBounds.maxY) / 2;

      // Calculate pan so content center is at viewport center
      const newPanX = canvasWidth / 2 / clampedZoom - contentCenterX;
      const newPanY = canvasHeight / 2 / clampedZoom - contentCenterY;

      setViewport({
        zoom: clampedZoom,
        panX: newPanX,
        panY: newPanY,
      });
    },
    [setViewport, resetZoom],
  );

  // ---------------------------------------------------------------------------
  // Pan by delta (in screen pixels)
  // ---------------------------------------------------------------------------
  const panBy = useCallback(
    (deltaX: number, deltaY: number) => {
      setViewport({
        zoom: viewport.zoom,
        panX: viewport.panX + deltaX / viewport.zoom,
        panY: viewport.panY + deltaY / viewport.zoom,
      });
    },
    [viewport, setViewport],
  );

  // ---------------------------------------------------------------------------
  // Handle wheel event for zooming
  // ---------------------------------------------------------------------------
  const handleWheel = useCallback(
    (e: React.WheelEvent, canvasRect: DOMRect) => {
      // Only zoom with Ctrl/Cmd
      if (!e.ctrlKey && !e.metaKey) return false;

      e.preventDefault();

      const zoomFactor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      const newZoom = viewport.zoom * zoomFactor;

      zoomAtPoint(newZoom, e.clientX, e.clientY, canvasRect);
      return true;
    },
    [viewport.zoom, zoomAtPoint],
  );

  return {
    viewport,
    setViewport,
    screenToCanvas,
    canvasToScreen,
    zoomAtPoint,
    zoomIn,
    zoomOut,
    resetZoom,
    zoomToFit,
    panBy,
    handleWheel,
  };
}
