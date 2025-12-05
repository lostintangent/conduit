/**
 * TreeResizer - Draggable divider between tree and editor panels.
 *
 * Provides a vertical handle that users can drag to resize the file tree
 * panel width. Includes visual feedback on hover and during drag.
 *
 * Uses the same approach as v1 EditorPane:
 * - Always-visible 1px border
 * - Wider interactive area that highlights on hover/drag
 * - Position-based width calculation (not delta-based)
 *
 * @example
 * ```tsx
 * <TreeResizer
 *   currentWidth={treeWidth}
 *   onResize={(width) => setTreeWidth(width)}
 *   minWidth={150}
 *   maxWidth={500}
 * />
 * ```
 */

import { useCallback, useEffect, useState, useRef } from "react";

// ============================================================================
// Types
// ============================================================================

export interface TreeResizerProps {
  /** Current tree width */
  currentWidth: number;

  /** Callback when tree width changes during drag */
  onResize: (width: number) => void;

  /** Minimum tree width (default: 150) */
  minWidth?: number;

  /** Maximum tree width (default: 500) */
  maxWidth?: number;

  /** Callback when resize starts (for disabling transitions) */
  onResizeStart?: () => void;

  /** Callback when resize ends */
  onResizeEnd?: () => void;
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
  currentWidth,
  onResize,
  minWidth = 150,
  maxWidth = 500,
  onResizeStart,
  onResizeEnd,
}: TreeResizerProps) {
  const [isResizing, setIsResizing] = useState(false);
  const resizerRef = useRef<HTMLDivElement>(null);

  // Prevent unused variable warning - currentWidth is used by parent for positioning
  void currentWidth;

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

    // Find the closest ancestor editor pane container
    // Using closest() instead of querySelector() to support multiple editors
    // in the global container pattern
    const container = resizerRef.current?.closest(
      '[data-testid="editor-pane-v2"]',
    );
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const containerRect = container.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;

      // Clamp to min/max bounds
      const clampedWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);
      onResize(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      onResizeEnd?.();
    };

    // Add global listeners
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    // Set cursor on body during resize for consistent feedback
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, minWidth, maxWidth, onResize, onResizeEnd]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Resize handle highlight class (matches v1 pane resize behavior)
  const handleClass = isResizing
    ? "bg-accent"
    : "bg-transparent hover:bg-accent";

  return (
    <div
      ref={resizerRef}
      className="relative flex items-center justify-center w-px"
      data-testid="tree-resizer"
    >
      {/* Always-visible thin border */}
      <div className="absolute w-px h-full bg-border" />

      {/* Wider interactive handle that highlights on hover/drag */}
      <div
        className={`w-1 absolute h-full cursor-col-resize transition-colors z-10 ${handleClass}`}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}
