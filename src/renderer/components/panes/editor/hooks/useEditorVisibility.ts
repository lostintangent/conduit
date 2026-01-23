/**
 * useEditorVisibility - Hook for detecting editor container visibility changes.
 *
 * This hook monitors a container element for visibility changes and triggers
 * callbacks when the element becomes visible or hidden. It's designed to work
 * with Monaco editors which need layout() called when becoming visible.
 *
 * Visibility is tracked via two mechanisms:
 * 1. IntersectionObserver - Detects when element enters/leaves viewport
 * 2. MutationObserver - Detects CSS display/visibility changes on ancestor
 */

import { useCallback, useEffect, useRef } from "react";

export interface UseEditorVisibilityOptions {
  /**
   * Callback fired when the container becomes visible.
   * This is where you'd call editor.layout() for Monaco.
   */
  onVisible?: () => void;

  /**
   * Callback fired when the container becomes hidden.
   * Can be used to pause expensive operations.
   */
  onHidden?: () => void;

  /**
   * Whether visibility tracking is enabled.
   * Useful for disabling tracking in certain modes.
   * @default true
   */
  enabled?: boolean;

  /**
   * Debounce delay for visibility callbacks (ms).
   * Prevents rapid firing during animations.
   * @default 16 (one frame)
   */
  debounceMs?: number;
}

/**
 * Check if an element is visible (not display:none, visibility:hidden, etc.)
 */
function isElementVisible(element: HTMLElement): boolean {
  // Check if element has zero size (usually means display:none or similar)
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }

  // Check computed styles
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  // Check if any ancestor is hidden
  let parent = element.parentElement;
  while (parent) {
    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.display === "none" || parentStyle.visibility === "hidden") {
      return false;
    }
    parent = parent.parentElement;
  }

  return true;
}

/**
 * Check if an element is in the viewport.
 */
function isInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for tracking editor container visibility.
 *
 * @param containerRef - Ref to the container element to monitor
 * @param options - Configuration options
 */
export function useEditorVisibility(
  containerRef: React.RefObject<HTMLElement>,
  options: UseEditorVisibilityOptions = {},
) {
  const { onVisible, onHidden, enabled = true, debounceMs = 16 } = options;

  // Track current visibility state to avoid duplicate callbacks
  const isVisibleRef = useRef<boolean | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable callback refs to avoid effect re-runs
  const onVisibleRef = useRef(onVisible);
  const onHiddenRef = useRef(onHidden);

  useEffect(() => {
    onVisibleRef.current = onVisible;
  }, [onVisible]);

  useEffect(() => {
    onHiddenRef.current = onHidden;
  }, [onHidden]);

  /**
   * Check visibility and fire appropriate callback.
   */
  const checkVisibility = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const visible = isElementVisible(container) && isInViewport(container);

    // Only fire callback if visibility changed
    if (visible !== isVisibleRef.current) {
      isVisibleRef.current = visible;

      // Clear any pending debounced call
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Debounce the callback
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        if (visible) {
          onVisibleRef.current?.();
        } else {
          onHiddenRef.current?.();
        }
      }, debounceMs);
    }
  }, [containerRef, debounceMs]);

  // Main effect for setting up observers
  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    // Initial visibility check
    checkVisibility();

    // IntersectionObserver for viewport visibility
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        // We only observe one element, so just check visibility
        if (entries.length > 0) {
          checkVisibility();
        }
      },
      {
        // Use a small threshold to detect as soon as element enters viewport
        threshold: 0.01,
        // Observe relative to viewport
        root: null,
      },
    );

    intersectionObserver.observe(container);

    // MutationObserver for CSS changes on ancestors
    // This catches display:none toggles that IntersectionObserver misses
    const mutationObserver = new MutationObserver((mutations) => {
      // Check if any mutation affects visibility
      const hasStyleChange = mutations.some(
        (mutation) =>
          mutation.type === "attributes" &&
          (mutation.attributeName === "style" ||
            mutation.attributeName === "class" ||
            mutation.attributeName === "hidden"),
      );

      if (hasStyleChange) {
        // Delay check to let styles settle
        requestAnimationFrame(checkVisibility);
      }
    });

    // Observe the container and all ancestors for attribute changes
    let element: HTMLElement | null = container;
    const observedElements: HTMLElement[] = [];

    while (element) {
      mutationObserver.observe(element, {
        attributes: true,
        attributeFilter: ["style", "class", "hidden"],
      });
      observedElements.push(element);
      element = element.parentElement;
    }

    // ResizeObserver for size changes (which might indicate visibility change)
    const resizeObserver = new ResizeObserver(() => {
      checkVisibility();
    });

    resizeObserver.observe(container);

    // Also listen for window resize
    const handleResize = () => {
      checkVisibility();
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      intersectionObserver.disconnect();
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [enabled, containerRef, checkVisibility]);

  /**
   * Manually trigger a visibility check.
   * Useful after DOM operations that might affect visibility.
   */
  const forceCheck = useCallback(() => {
    checkVisibility();
  }, [checkVisibility]);

  return {
    /**
     * Manually trigger a visibility check.
     */
    forceCheck,

    /**
     * Current visibility state (may be null before first check).
     */
    isVisible: isVisibleRef.current,
  };
}
