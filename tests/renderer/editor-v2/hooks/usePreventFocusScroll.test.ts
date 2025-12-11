/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePreventFocusScroll } from "../../../../src/renderer/components/panes/editor-v2/hooks/usePreventFocusScroll";

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Creates a mock DOM structure with a scrollable parent.
 */
function createMockDOMStructure() {
  // Create scrollable parent
  const scrollableParent = document.createElement("div");
  Object.defineProperty(scrollableParent, "scrollTop", {
    value: 100,
    writable: true,
  });

  // Mock getComputedStyle to return overflow: auto for scrollable parent
  const originalGetComputedStyle = window.getComputedStyle;
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
    if (element === scrollableParent) {
      return { overflowY: "auto" } as CSSStyleDeclaration;
    }
    return originalGetComputedStyle(element);
  });

  // Create container (child of scrollable parent)
  const container = document.createElement("div");
  scrollableParent.appendChild(container);
  document.body.appendChild(scrollableParent);

  return { container, scrollableParent };
}

/**
 * Dispatches a mouse event on an element.
 */
function dispatchMouseEvent(
  element: HTMLElement | Document,
  type: "mousedown" | "mouseup",
  options: { capture?: boolean } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
}

// ============================================================================
// Tests
// ============================================================================

describe("usePreventFocusScroll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  // ===========================================================================
  // Basic Setup
  // ===========================================================================

  describe("basic setup", () => {
    it("should not throw when containerRef is null", () => {
      const containerRef = { current: null };

      expect(() => {
        renderHook(() => usePreventFocusScroll(containerRef));
      }).not.toThrow();
    });

    it("should add mousedown listener to container", () => {
      const { container } = createMockDOMStructure();
      const containerRef = { current: container };
      const addEventListenerSpy = vi.spyOn(container, "addEventListener");

      renderHook(() => usePreventFocusScroll(containerRef));

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "mousedown",
        expect.any(Function),
        true,
      );
    });

    it("should add mouseup listener to document", () => {
      const { container } = createMockDOMStructure();
      const containerRef = { current: container };
      const addEventListenerSpy = vi.spyOn(document, "addEventListener");

      renderHook(() => usePreventFocusScroll(containerRef));

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "mouseup",
        expect.any(Function),
        true,
      );
    });
  });

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  describe("cleanup", () => {
    it("should remove mousedown listener on unmount", () => {
      const { container } = createMockDOMStructure();
      const containerRef = { current: container };
      const removeEventListenerSpy = vi.spyOn(container, "removeEventListener");

      const { unmount } = renderHook(() => usePreventFocusScroll(containerRef));
      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "mousedown",
        expect.any(Function),
        true,
      );
    });

    it("should remove mouseup listener on unmount", () => {
      const { container } = createMockDOMStructure();
      const containerRef = { current: container };
      const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");

      const { unmount } = renderHook(() => usePreventFocusScroll(containerRef));
      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "mouseup",
        expect.any(Function),
        true,
      );
    });
  });

  // ===========================================================================
  // Scroll Prevention
  // ===========================================================================

  describe("scroll prevention", () => {
    it("should capture scroll position on mousedown", () => {
      const { container, scrollableParent } = createMockDOMStructure();
      const containerRef = { current: container };

      renderHook(() => usePreventFocusScroll(containerRef));

      // Initial scroll position
      expect(scrollableParent.scrollTop).toBe(100);

      // Trigger mousedown
      dispatchMouseEvent(container, "mousedown");

      // Scroll position should still be captured (no change yet)
      expect(scrollableParent.scrollTop).toBe(100);
    });

    it("should add scroll listener on mousedown", () => {
      const { container, scrollableParent } = createMockDOMStructure();
      const containerRef = { current: container };
      const addEventListenerSpy = vi.spyOn(
        scrollableParent,
        "addEventListener",
      );

      renderHook(() => usePreventFocusScroll(containerRef));

      dispatchMouseEvent(container, "mousedown");

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "scroll",
        expect.any(Function),
      );
    });

    it("should remove scroll listener after mouseup with delay", () => {
      const { container, scrollableParent } = createMockDOMStructure();
      const containerRef = { current: container };
      const removeEventListenerSpy = vi.spyOn(
        scrollableParent,
        "removeEventListener",
      );

      renderHook(() => usePreventFocusScroll(containerRef));

      // Mousedown then mouseup
      dispatchMouseEvent(container, "mousedown");
      dispatchMouseEvent(document, "mouseup");

      // Should not be removed immediately
      expect(removeEventListenerSpy).not.toHaveBeenCalledWith(
        "scroll",
        expect.any(Function),
      );

      // Advance timers past the 150ms delay
      vi.advanceTimersByTime(200);

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "scroll",
        expect.any(Function),
      );
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("edge cases", () => {
    it("should handle container with no scrollable parent", () => {
      // Create container with no scrollable parent
      const container = document.createElement("div");
      document.body.appendChild(container);

      // Mock getComputedStyle to never return scrollable overflow
      vi.spyOn(window, "getComputedStyle").mockReturnValue({
        overflowY: "visible",
      } as CSSStyleDeclaration);

      const containerRef = { current: container };

      // Should not throw
      expect(() => {
        renderHook(() => usePreventFocusScroll(containerRef));
        dispatchMouseEvent(container, "mousedown");
        dispatchMouseEvent(document, "mouseup");
        vi.advanceTimersByTime(200);
      }).not.toThrow();
    });

    it("should handle multiple mousedown events", () => {
      const { container, scrollableParent } = createMockDOMStructure();
      const containerRef = { current: container };
      const addEventListenerSpy = vi.spyOn(
        scrollableParent,
        "addEventListener",
      );

      renderHook(() => usePreventFocusScroll(containerRef));

      // Multiple mousedown events
      dispatchMouseEvent(container, "mousedown");
      dispatchMouseEvent(container, "mousedown");
      dispatchMouseEvent(container, "mousedown");

      // Should only add scroll listener once (scrollListenerActive flag)
      const scrollListenerCalls = addEventListenerSpy.mock.calls.filter(
        (call) => call[0] === "scroll",
      );
      expect(scrollListenerCalls.length).toBe(1);
    });
  });
});
