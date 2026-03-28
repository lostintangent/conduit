/**
 * useScrollPersistence Hook
 *
 * Registers a scroll container with EditorPaneRegistry for automatic
 * scroll position preservation across DOM moves (attach/detach cycles).
 *
 * This is a core feature of the global editor container pattern. When an
 * editor pane is detached (moved off-screen) and re-attached (moved back),
 * the DOM move operation resets scroll positions. This hook ensures scroll
 * positions are saved in real-time during scrolling and restored after DOM moves.
 *
 * Uses a callback ref pattern to handle conditional rendering - the scroll
 * container is registered when the element mounts and unregistered when
 * it unmounts, regardless of when that happens relative to the initial render.
 *
 * Performance: Scroll position updates are throttled to avoid excessive
 * registry updates during rapid scrolling.
 *
 * @example
 * ```tsx
 * function FileTree({ paneId }: { paneId: string }) {
 *   const scrollRef = useScrollPersistence(paneId, 'fileTree');
 *
 *   return (
 *     <nav ref={scrollRef} className="overflow-auto h-full">
 *       {files.map(file => ...)}
 *     </nav>
 *   );
 * }
 * ```
 */

import { useCallback, useRef } from "react";
import { EditorPaneRegistry } from "../registry/EditorPaneRegistry";

// Throttle interval for scroll position updates (ms)
const SCROLL_UPDATE_THROTTLE = 100;

/**
 * Hook to register a scroll container for automatic scroll position persistence.
 *
 * Returns a callback ref to attach to the scrollable element. The hook:
 * 1. Registers the element with EditorPaneRegistry on mount
 * 2. Tracks scroll position in real-time (throttled for performance)
 * 3. Unregisters on unmount
 *
 * The registry handles saving positions before DOM detach and restoring
 * after DOM attach automatically.
 *
 * @param paneId - The editor pane ID (from EditorPaneRegistry)
 * @param scrollId - Unique identifier for this scroll container within the pane
 *                   (e.g., "fileTree", "changesTree", "editorList")
 * @returns A callback ref to attach to the scrollable element
 */
export function useScrollPersistence(
  paneId: string,
  scrollId: string,
): (element: HTMLElement | null) => void {
  // Track the currently registered element to avoid duplicate registrations
  const registeredElementRef = useRef<HTMLElement | null>(null);
  // Track scroll listener cleanup function
  const cleanupRef = useRef<(() => void) | null>(null);

  const callbackRef = useCallback(
    (element: HTMLElement | null) => {
      const registry = EditorPaneRegistry.getInstance();

      // Clean up previous element if it changed
      if (
        registeredElementRef.current &&
        registeredElementRef.current !== element
      ) {
        if (cleanupRef.current) {
          cleanupRef.current();
          cleanupRef.current = null;
        }
        registry.unregisterScrollContainer(paneId, scrollId);
        registeredElementRef.current = null;
      }

      // Register the new element
      if (element && element !== registeredElementRef.current) {
        registry.registerScrollContainer(paneId, scrollId, element);
        registeredElementRef.current = element;

        // Set up throttled scroll listener
        // Scroll events fire very frequently, so we throttle updates to the registry
        let lastUpdate = 0;
        let rafId: number | null = null;

        const scrollListener = () => {
          const now = Date.now();

          // Throttle: only update if enough time has passed since last update
          if (now - lastUpdate >= SCROLL_UPDATE_THROTTLE) {
            lastUpdate = now;
            registry.updateScrollPosition(paneId, scrollId, element.scrollTop);
          } else {
            // Schedule an update for the throttle interval
            if (rafId === null) {
              rafId = requestAnimationFrame(() => {
                rafId = null;
                const remaining =
                  SCROLL_UPDATE_THROTTLE - (Date.now() - lastUpdate);
                if (remaining <= 0) {
                  lastUpdate = Date.now();
                  registry.updateScrollPosition(
                    paneId,
                    scrollId,
                    element.scrollTop,
                  );
                }
              });
            }
          }
        };

        element.addEventListener("scroll", scrollListener, { passive: true });

        // Store cleanup function
        cleanupRef.current = () => {
          element.removeEventListener("scroll", scrollListener);
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
        };
      }

      // Handle unmount (element becomes null)
      if (!element && registeredElementRef.current) {
        if (cleanupRef.current) {
          cleanupRef.current();
          cleanupRef.current = null;
        }
        registry.unregisterScrollContainer(paneId, scrollId);
        registeredElementRef.current = null;
      }
    },
    [paneId, scrollId],
  );

  return callbackRef;
}
