/**
 * ResizablePanel - A right-side sliding panel with resizable width
 *
 * Renders a panel that slides in from the right edge of the screen.
 * Width is resizable via a drag handle and persisted to localStorage.
 *
 * @example
 * ```tsx
 * <ResizablePanel
 *   storageKey="my-panel-width"
 *   isOpen={isOpen}
 * >
 *   <MyContent />
 * </ResizablePanel>
 * ```
 */

import { cn } from "@/utils";
import { useCallback, useEffect, useRef, useState } from "react";

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MIN_WIDTH_PX = 250;
const DEFAULT_MIN_WIDTH_PERCENT = 0.15;
const DEFAULT_MAX_WIDTH_PERCENT = 0.75;
const DEFAULT_WIDTH_PERCENT = 0.25;

// =============================================================================
// Types
// =============================================================================

interface ResizablePanelProps {
  /** localStorage key for persisting width */
  storageKey: string;

  /** Whether the panel is open (visible) */
  isOpen: boolean;

  /** Whether the panel is expanded to full width */
  isExpanded?: boolean;

  /** Panel content */
  children: React.ReactNode;

  /** Default width as percentage of window (0-1). Default: 0.25 */
  defaultWidthPercent?: number;

  /** Minimum width as percentage of window (0-1). Default: 0.15 */
  minWidthPercent?: number;

  /** Maximum width as percentage of window (0-1). Default: 0.75 */
  maxWidthPercent?: number;

  /** Minimum width in pixels. Takes precedence over minWidthPercent if larger. Default: 250 */
  minWidthPx?: number;

  /** Additional className for the panel container */
  className?: string;
}

// =============================================================================
// Helpers
// =============================================================================

function getInitialWidth(
  storageKey: string,
  defaultValue: number,
  min: number,
  max: number,
): number {
  const saved = localStorage.getItem(storageKey);
  if (saved !== null) {
    const parsed = parseFloat(saved);
    if (!isNaN(parsed) && parsed >= min && parsed <= max) {
      return parsed;
    }
  }
  return defaultValue;
}

// =============================================================================
// Component
// =============================================================================

export function ResizablePanel({
  storageKey,
  isOpen,
  isExpanded = false,
  children,
  defaultWidthPercent = DEFAULT_WIDTH_PERCENT,
  minWidthPercent = DEFAULT_MIN_WIDTH_PERCENT,
  maxWidthPercent = DEFAULT_MAX_WIDTH_PERCENT,
  minWidthPx = DEFAULT_MIN_WIDTH_PX,
  className,
}: ResizablePanelProps) {
  // Width state - initialized from localStorage
  const [widthPercent, setWidthPercent] = useState(() =>
    getInitialWidth(
      storageKey,
      defaultWidthPercent,
      minWidthPercent,
      maxWidthPercent,
    ),
  );

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const [isHoveringHandle, setIsHoveringHandle] = useState(false);

  // Track if width changed during this resize operation
  const hasResizedRef = useRef(false);

  // Handle resize drag
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const windowWidth = window.innerWidth;
      const newWidthPx = windowWidth - e.clientX;
      let newWidthPercent = newWidthPx / windowWidth;

      // Calculate effective minimum (account for both percentage and pixel minimums)
      const effectiveMinPercent = Math.max(
        minWidthPercent,
        minWidthPx / windowWidth,
      );

      // Clamp to min/max
      newWidthPercent = Math.min(
        Math.max(newWidthPercent, effectiveMinPercent),
        maxWidthPercent,
      );

      setWidthPercent(newWidthPercent);
      hasResizedRef.current = true;
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    // Set cursor and disable text selection during drag
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, minWidthPercent, maxWidthPercent, minWidthPx]);

  // Persist width only after resize ends (not during drag)
  useEffect(() => {
    if (!isResizing && hasResizedRef.current) {
      localStorage.setItem(storageKey, widthPercent.toString());
      hasResizedRef.current = false;
    }
  }, [isResizing, widthPercent, storageKey]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      // Don't allow resizing when expanded
      if (isExpanded) return;
      e.preventDefault();
      setIsResizing(true);
    },
    [isExpanded],
  );

  const showAccentBorder = isResizing || isHoveringHandle;

  // Use full width when expanded, otherwise use the resizable width
  const effectiveWidth = isExpanded ? 1 : widthPercent;

  return (
    <div
      className={cn(
        "absolute top-0 right-0 bottom-0 z-40 flex",
        "bg-background shadow-2xl",
        // Only show left border when not expanded
        !isExpanded && "border-l border-border",
        "transition-all duration-200 ease-out",
        isOpen ? "translate-x-0" : "translate-x-full",
        className,
      )}
      style={{ width: `${effectiveWidth * 100}%` }}
    >
      {/* Resize handle on left edge - hidden when expanded */}
      {!isExpanded && (
        <div className="relative flex items-center justify-center shrink-0">
          {/* Visible border line - thin by default, thicker accent on hover/drag */}
          <div
            className={cn(
              "absolute h-full transition-all",
              showAccentBorder ? "w-1 bg-accent" : "w-px bg-border",
            )}
          />

          {/* Wider invisible hit area for easier dragging */}
          <div
            className="absolute w-2 h-full cursor-col-resize z-10 -left-1.5"
            onMouseDown={handleResizeStart}
            onMouseEnter={() => setIsHoveringHandle(true)}
            onMouseLeave={() => setIsHoveringHandle(false)}
          />
        </div>
      )}

      {/* Panel content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
