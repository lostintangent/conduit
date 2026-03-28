/**
 * usePreventFocusScroll Hook
 *
 * Prevents the browser's automatic scroll-into-view behavior when focusing
 * elements inside a container. This is particularly useful for Monaco editors
 * embedded in scrollable lists where clicking an editor that's partially
 * scrolled out of view would normally cause the parent to scroll.
 *
 * Works by patching the `focus()` method on all focusable elements inside
 * the container to always use `{ preventScroll: true }`.
 */

import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'input, textarea, button, [tabindex], [contenteditable="true"]';

export function usePreventFocusScroll(
  containerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const patchedElements = new WeakSet<HTMLElement>();
    const originalFocusMethods = new WeakMap<
      HTMLElement,
      typeof HTMLElement.prototype.focus
    >();

    const patchFocus = (element: HTMLElement) => {
      if (patchedElements.has(element)) return;
      patchedElements.add(element);

      const originalFocus = element.focus.bind(element);
      originalFocusMethods.set(element, originalFocus);

      element.focus = function (options?: FocusOptions) {
        originalFocus({ preventScroll: true, ...options });
      };
    };

    const patchTree = (root: Element) => {
      if (root instanceof HTMLElement && root.matches(FOCUSABLE_SELECTOR)) {
        patchFocus(root);
      }
      root
        .querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        .forEach(patchFocus);
    };

    patchTree(container);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            patchTree(node);
          }
        }
      }
    });
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      container
        .querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        .forEach((el) => {
          const original = originalFocusMethods.get(el);
          if (original) el.focus = original;
        });
    };
  }, [containerRef]);
}
