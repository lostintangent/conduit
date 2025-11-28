/**
 * TreeResizer - Draggable divider between tree and editor panels.
 *
 * Provides a vertical handle that users can drag to resize the file tree
 * panel width. Includes visual feedback on hover and during drag.
 *
 * @example
 * ```tsx
 * <TreeResizer
 *   onResize={(width) => setTreeWidth(width)}
 *   minWidth={150}
 *   maxWidth={500}
 * />
 * ```
 */

import { useCallback, useRef, useEffect, useState } from "react";
import { cn } from "@/utils";

// ============================================================================
// Types
// ============================================================================

export interface TreeResizerProps {
  /** Callback when tree width changes during drag */
  onResize: (width: number) => void;

  /** Current tree width (for drag calculations) */
  currentWidth: number;

  /** Minimum tree width (default: 150) */
  minWidth?: number;

  /** Maximum tree width (default: 500) */
  maxWidth?: number;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Draggable divider for resizing the tree panel.
 *
 * Uses mouse events for drag handling with proper cleanup.
 * Shows visual feedback when hovered or being dragged.
 */
export function TreeResizer({
  onResize,
  currentWidth,
  minWidth = 150,
  maxWidth = 500,
}: TreeResizerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef<number>(0);
  const dragStartWidthRef = useRef<number>(0);

  // ---------------------------------------------------------------------------
  // Drag Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle mouse move during drag.
   */
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartXRef.current;
      const newWidth = dragStartWidthRef.current + deltaX;

      // Clamp to min/max bounds
      const clampedWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);
      onResize(clampedWidth);
    },
    [minWidth, maxWidth, onResize],
  );

  /**
   * Handle mouse up to end drag.
   */
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  /**
   * Handle mouse down to start drag.
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragStartXRef.current = e.clientX;
      dragStartWidthRef.current = currentWidth;
    },
    [currentWidth],
  );

  // ---------------------------------------------------------------------------
  // Global Mouse Event Listeners
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isDragging) return;

    // Add global listeners during drag
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    // Set cursor on body during drag
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className={cn(
        "flex-shrink-0 w-1 cursor-col-resize group",
        "hover:bg-primary/20 transition-colors",
        isDragging && "bg-primary/40",
      )}
      onMouseDown={handleMouseDown}
      data-testid="tree-resizer"
    >
      {/* Visual handle indicator */}
      <div
        className={cn(
          "h-full w-full",
          "border-l border-border",
          "group-hover:border-primary/50",
          isDragging && "border-primary",
        )}
      />
    </div>
  );
}
