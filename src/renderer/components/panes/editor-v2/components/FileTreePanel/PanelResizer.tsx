/**
 * PanelResizer - Horizontal draggable divider for resizing panel heights.
 *
 * Provides a horizontal handle that users can drag to resize panel heights.
 * Used between FileTreeChanges and CommitGraphPanel.
 *
 * Features:
 * - Always-visible 1px border
 * - Wider interactive area that highlights on hover/drag
 * - Position-based height calculation
 * - Smooth drag handling with document-level listeners
 *
 * @example
 * ```tsx
 * <PanelResizer
 *   onResize={(height) => setHeight(height)}
 *   minHeight={100}
 *   maxHeight={400}
 * />
 * ```
 */

import { useCallback, useEffect, useState, useRef } from "react";

export interface PanelResizerProps {
  /** Callback when height changes during drag */
  onResize: (height: number) => void;

  /** Minimum height (default: 100) */
  minHeight?: number;

  /** Maximum height (default: 400) */
  maxHeight?: number;

  /** Callback when resize starts */
  onResizeStart?: () => void;

  /** Callback when resize ends */
  onResizeEnd?: () => void;
}

/**
 * Horizontal draggable divider for resizing panel heights.
 *
 * Uses mouse events for drag handling with proper cleanup.
 * Shows visual feedback when hovered or being dragged.
 */
export function PanelResizer({
  onResize,
  minHeight = 100,
  maxHeight = 400,
  onResizeStart,
  onResizeEnd,
}: PanelResizerProps) {
  const [isResizing, setIsResizing] = useState(false);
  const resizerRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Resize Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle mouse down to start resize.
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      onResizeStart?.();
    },
    [onResizeStart],
  );

  /**
   * Effect to handle mouse move and mouse up during resize.
   * Uses document-level listeners for smooth dragging even when cursor
   * leaves the handle area.
   */
  useEffect(() => {
    if (!isResizing) return;

    // Find the closest file-tree-panel container
    const container = resizerRef.current?.closest(
      '[data-testid="file-tree-panel"]',
    );
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const containerRect = container.getBoundingClientRect();

      // Calculate height from bottom of container to mouse position
      // The panel we're resizing is below the resizer
      const newHeight = containerRect.bottom - e.clientY;

      // Clamp to min/max bounds
      const clampedHeight = Math.min(Math.max(newHeight, minHeight), maxHeight);
      onResize(clampedHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      onResizeEnd?.();
    };

    // Add global listeners
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    // Set cursor on body during resize for consistent feedback
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, minHeight, maxHeight, onResize, onResizeEnd]);

  // Resize handle highlight class
  const handleClass = isResizing
    ? "bg-accent"
    : "bg-transparent hover:bg-accent";

  return (
    <div
      ref={resizerRef}
      className="relative flex items-center justify-center h-px shrink-0"
      data-testid="panel-resizer"
    >
      {/* Always-visible thin border */}
      <div className="absolute h-px w-full bg-border" />

      {/* Wider interactive handle that highlights on hover/drag */}
      <div
        className={`h-1.5 absolute w-full cursor-row-resize transition-colors z-10 ${handleClass}`}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}
