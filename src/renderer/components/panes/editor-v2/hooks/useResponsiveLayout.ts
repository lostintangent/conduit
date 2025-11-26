/**
 * useResponsiveLayout Hook
 *
 * Monitors a container's width and returns the appropriate layout mode
 * (split or single column). Uses ResizeObserver for efficient monitoring
 * and debounces updates to prevent rapid state changes during resize.
 *
 * @example
 * ```tsx
 * function EditorPane() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const layout = useResponsiveLayout(containerRef);
 *
 *   return (
 *     <div ref={containerRef} className="editor-pane">
 *       {layout === 'split' ? (
 *         <SplitView left={<FileTree />} right={<Editor />} />
 *       ) : (
 *         <SingleView>
 *           <Tabs />
 *           <CurrentView />
 *         </SingleView>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */

import { useEffect, useState, RefObject } from "react";

/**
 * Layout mode based on container width.
 *
 * - `split`: Container is wide enough for side-by-side panels
 * - `single`: Container is narrow, show one panel at a time
 */
export type LayoutMode = "split" | "single";

/** Breakpoint width in pixels */
const BREAKPOINT_WIDTH = 600;

/** Debounce delay in milliseconds */
const DEBOUNCE_MS = 100;

/**
 * Hook to determine layout mode based on container width.
 *
 * Uses ResizeObserver to efficiently monitor the container and
 * debounces updates to prevent rapid state changes.
 *
 * @param containerRef - Ref to the container element to monitor
 * @param breakpoint - Width threshold (default: 600px)
 * @returns Current layout mode ('split' or 'single')
 */
export function useResponsiveLayout(
  containerRef: RefObject<HTMLElement | null>,
  breakpoint: number = BREAKPOINT_WIDTH,
): LayoutMode {
  const [layout, setLayout] = useState<LayoutMode>("split");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Calculate layout based on current width
    const calculateLayout = (width: number): LayoutMode => {
      return width < breakpoint ? "single" : "split";
    };

    // Debounced handler for resize events
    const handleResize = (entries: ResizeObserverEntry[]) => {
      // Clear any pending update
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      // Get the container's content box width
      const entry = entries[0];
      if (!entry) return;

      const width = entry.contentRect.width;

      // Debounce the state update
      timeoutId = setTimeout(() => {
        const newLayout = calculateLayout(width);
        setLayout(newLayout);
        timeoutId = null;
      }, DEBOUNCE_MS);
    };

    // Create ResizeObserver
    const observer = new ResizeObserver(handleResize);

    // Start observing
    observer.observe(container);

    // Set initial layout synchronously (no debounce for initial render)
    const initialWidth = container.getBoundingClientRect().width;
    setLayout(calculateLayout(initialWidth));

    // Cleanup
    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      observer.disconnect();
    };
  }, [containerRef, breakpoint]);

  return layout;
}
