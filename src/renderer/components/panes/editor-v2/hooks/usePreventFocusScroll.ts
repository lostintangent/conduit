/**
 * usePreventFocusScroll Hook
 *
 * Prevents the browser's automatic scroll-into-view behavior when focusing
 * elements inside a container. This is particularly useful for Monaco editors
 * embedded in scrollable lists where clicking an editor that's partially
 * scrolled out of view would normally cause the parent to scroll.
 *
 * The hook works by:
 * 1. Capturing the parent's scroll position on mousedown (before focus)
 * 2. Setting up a temporary scroll listener that reverts any scroll changes
 * 3. Cleaning up after mouseup with a small delay for async scroll events
 *
 * @example
 * ```tsx
 * function EditorWrapper() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   usePreventFocusScroll(containerRef);
 *
 *   return <div ref={containerRef}>...</div>;
 * }
 * ```
 */

import { useEffect, useCallback, type RefObject } from "react";

/**
 * Finds the nearest ancestor element with scrollable overflow.
 */
function findScrollableParent(element: HTMLElement | null): HTMLElement | null {
  if (!element) return null;

  let parent = element.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    const overflowY = style.overflowY;
    if (overflowY === "auto" || overflowY === "scroll") {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

/**
 * Prevents browser's automatic scroll-into-view when focusing elements
 * inside the container.
 *
 * @param containerRef - Ref to the container element to protect from focus scroll
 */
export function usePreventFocusScroll(
  containerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let savedScrollTop: number | null = null;
    let scrollableParent: HTMLElement | null = null;
    let scrollListenerActive = false;

    // Revert any scroll that happens while listener is active
    const handleScroll = () => {
      if (scrollableParent && savedScrollTop !== null) {
        scrollableParent.scrollTop = savedScrollTop;
      }
    };

    // Capture scroll position on mousedown BEFORE focus happens
    const handleMouseDown = () => {
      scrollableParent = findScrollableParent(container);
      if (scrollableParent) {
        savedScrollTop = scrollableParent.scrollTop;

        // Set up scroll listener to revert any scrolling
        if (!scrollListenerActive) {
          scrollListenerActive = true;
          scrollableParent.addEventListener("scroll", handleScroll);
        }
      }
    };

    // Clean up after mouseup
    const handleMouseUp = () => {
      // Keep restoring for a bit longer in case of delayed scroll
      setTimeout(() => {
        if (scrollableParent && scrollListenerActive) {
          scrollableParent.removeEventListener("scroll", handleScroll);
          scrollListenerActive = false;
        }
        savedScrollTop = null;
      }, 150);
    };

    // Use capture phase to intercept before other handlers
    container.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("mouseup", handleMouseUp, true);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("mouseup", handleMouseUp, true);
      if (scrollableParent && scrollListenerActive) {
        scrollableParent.removeEventListener("scroll", handleScroll);
      }
    };
  }, [containerRef]);
}
