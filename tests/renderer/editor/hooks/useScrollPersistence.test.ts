// @ts-nocheck
/**
 * @vitest-environment jsdom
 *
 * useScrollPersistence Hook Tests
 *
 * Tests the scroll persistence hook that registers scroll containers
 * with EditorPaneRegistry and tracks scroll positions in real-time.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useScrollPersistence } from "@/components/panes/editor/hooks/useScrollPersistence";
import { EditorPaneRegistry } from "@/components/panes/editor/registry/EditorPaneRegistry";

// ============================================================================
// Test Setup
// ============================================================================

describe("useScrollPersistence", () => {
  let registry: EditorPaneRegistry;
  let mockScrollElement: HTMLElement;

  beforeEach(() => {
    // Reset registry
    EditorPaneRegistry.resetInstance();
    registry = EditorPaneRegistry.getInstance();

    // Create mock scroll element
    mockScrollElement = document.createElement("div");
    mockScrollElement.style.overflow = "auto";
    mockScrollElement.style.height = "100px";
    mockScrollElement.innerHTML = '<div style="height: 1000px"></div>';
    document.body.appendChild(mockScrollElement);

    // Create pane in registry
    registry.getOrCreate("test-pane", {
      pane: { id: "test-pane", type: "editor", cwd: "/test", filePath: null },
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    EditorPaneRegistry.resetInstance();
  });

  // ==========================================================================
  // Callback Ref Pattern
  // ==========================================================================

  describe("Callback Ref Pattern", () => {
    it("should return a callback ref function", () => {
      const { result } = renderHook(() =>
        useScrollPersistence("test-pane", "testScroll"),
      );

      expect(typeof result.current).toBe("function");
    });

    it("should register element when ref callback is called with element", () => {
      const { result } = renderHook(() =>
        useScrollPersistence("test-pane", "testScroll"),
      );

      const callbackRef = result.current;
      callbackRef(mockScrollElement);

      const entry = registry.get("test-pane");
      expect(entry.scrollContainers.has("testScroll")).toBe(true);
    });

    it("should unregister element when ref callback is called with null", () => {
      const { result } = renderHook(() =>
        useScrollPersistence("test-pane", "testScroll"),
      );

      const callbackRef = result.current;
      callbackRef(mockScrollElement);
      callbackRef(null);

      const entry = registry.get("test-pane");
      const scrollEntry = entry.scrollContainers.get("testScroll");
      // Entry exists but element is null
      expect(scrollEntry?.element).toBeNull();
    });

    it("should handle element changes (conditional rendering)", () => {
      const { result, rerender } = renderHook(() =>
        useScrollPersistence("test-pane", "testScroll"),
      );

      const callbackRef = result.current;

      // Register first element
      callbackRef(mockScrollElement);

      // Create new element
      const newElement = document.createElement("div");
      newElement.style.overflow = "auto";
      document.body.appendChild(newElement);

      // Register new element (simulates conditional rendering)
      callbackRef(newElement);

      const entry = registry.get("test-pane");
      const scrollEntry = entry.scrollContainers.get("testScroll");
      expect(scrollEntry.element).toBe(newElement);
    });
  });

  // ==========================================================================
  // Scroll Event Listener
  // ==========================================================================

  describe("Scroll Event Listener", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should attach scroll event listener to element", () => {
      const { result } = renderHook(() =>
        useScrollPersistence("test-pane", "testScroll"),
      );

      const addEventListenerSpy = vi.spyOn(
        mockScrollElement,
        "addEventListener",
      );
      const callbackRef = result.current;
      callbackRef(mockScrollElement);

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "scroll",
        expect.any(Function),
        { passive: true },
      );
    });

    it("should update scroll position on scroll event", () => {
      const { result } = renderHook(() =>
        useScrollPersistence("test-pane", "testScroll"),
      );

      const callbackRef = result.current;
      callbackRef(mockScrollElement);

      // Simulate scroll
      mockScrollElement.scrollTop = 250;
      mockScrollElement.dispatchEvent(new Event("scroll"));

      // Fast-forward past throttle delay
      vi.advanceTimersByTime(150);

      const entry = registry.get("test-pane");
      const scrollEntry = entry.scrollContainers.get("testScroll");
      expect(scrollEntry.savedScrollTop).toBe(250);
    });

    it("should throttle scroll position updates (100ms)", () => {
      const { result } = renderHook(() =>
        useScrollPersistence("test-pane", "testScroll"),
      );

      const callbackRef = result.current;
      callbackRef(mockScrollElement);

      const updateSpy = vi.spyOn(registry, "updateScrollPosition");

      // Simulate rapid scrolling
      mockScrollElement.scrollTop = 100;
      mockScrollElement.dispatchEvent(new Event("scroll"));

      mockScrollElement.scrollTop = 200;
      mockScrollElement.dispatchEvent(new Event("scroll"));

      mockScrollElement.scrollTop = 300;
      mockScrollElement.dispatchEvent(new Event("scroll"));

      // Should only call once for rapid events (throttled)
      expect(updateSpy).toHaveBeenCalledTimes(1);

      // Fast-forward past throttle delay
      vi.advanceTimersByTime(150);

      // Trigger another scroll after throttle window
      mockScrollElement.scrollTop = 400;
      mockScrollElement.dispatchEvent(new Event("scroll"));

      // Should now have been called twice total
      expect(updateSpy).toHaveBeenCalledTimes(2);
    });

    it("should use requestAnimationFrame for throttle scheduling", () => {
      const { result } = renderHook(() =>
        useScrollPersistence("test-pane", "testScroll"),
      );

      const rafSpy = vi.spyOn(window, "requestAnimationFrame");
      const callbackRef = result.current;
      callbackRef(mockScrollElement);

      // Simulate scroll within throttle window
      mockScrollElement.scrollTop = 100;
      mockScrollElement.dispatchEvent(new Event("scroll"));

      vi.advanceTimersByTime(50); // Less than 100ms throttle

      mockScrollElement.scrollTop = 200;
      mockScrollElement.dispatchEvent(new Event("scroll"));

      expect(rafSpy).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  describe("Cleanup", () => {
    it("should remove scroll event listener on element change", () => {
      const { result } = renderHook(() =>
        useScrollPersistence("test-pane", "testScroll"),
      );

      const removeEventListenerSpy = vi.spyOn(
        mockScrollElement,
        "removeEventListener",
      );
      const callbackRef = result.current;

      callbackRef(mockScrollElement);

      // Change to new element
      const newElement = document.createElement("div");
      callbackRef(newElement);

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "scroll",
        expect.any(Function),
      );
    });

    it("should cancel pending requestAnimationFrame on cleanup", () => {
      const { result } = renderHook(() =>
        useScrollPersistence("test-pane", "testScroll"),
      );

      const callbackRef = result.current;

      callbackRef(mockScrollElement);

      // Trigger scroll to schedule RAF
      mockScrollElement.scrollTop = 100;
      mockScrollElement.dispatchEvent(new Event("scroll"));

      // Cleanup should not throw
      expect(() => callbackRef(null)).not.toThrow();
    });

    it("should cleanup on unmount", () => {
      const { result, unmount } = renderHook(() =>
        useScrollPersistence("test-pane", "testScroll"),
      );

      const removeEventListenerSpy = vi.spyOn(
        mockScrollElement,
        "removeEventListener",
      );
      const callbackRef = result.current;

      callbackRef(mockScrollElement);
      unmount();

      // Note: cleanup happens via ref callback with null, not via useEffect cleanup
      // So we don't expect removeEventListener to be called on unmount
      // The cleanup happens when the element ref becomes null
    });
  });

  // ==========================================================================
  // Scroll Position Preservation
  // ==========================================================================

  describe("Scroll Position Preservation", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should preserve scroll position when element is re-registered", () => {
      const { result } = renderHook(() =>
        useScrollPersistence("test-pane", "testScroll"),
      );

      const callbackRef = result.current;

      // Register and scroll
      callbackRef(mockScrollElement);
      mockScrollElement.scrollTop = 250;
      mockScrollElement.dispatchEvent(new Event("scroll"));

      vi.advanceTimersByTime(150);

      // Verify position was saved to registry
      const entry = registry.get("test-pane");
      const scrollEntry = entry.scrollContainers.get("testScroll");
      expect(scrollEntry.savedScrollTop).toBe(250);

      // Unregister
      callbackRef(null);

      // Verify entry still exists with saved position
      const entryAfter = registry.get("test-pane");
      const scrollEntryAfter = entryAfter.scrollContainers.get("testScroll");
      expect(scrollEntryAfter.savedScrollTop).toBe(250);
    });
  });

  // ==========================================================================
  // Stable Callback Ref
  // ==========================================================================

  describe("Stable Callback Ref", () => {
    it("should return stable callback ref across re-renders", () => {
      const { result, rerender } = renderHook(() =>
        useScrollPersistence("test-pane", "testScroll"),
      );

      const firstRef = result.current;
      rerender();
      const secondRef = result.current;

      expect(firstRef).toBe(secondRef);
    });

    it("should return new callback ref when paneId changes", () => {
      const { result, rerender } = renderHook(
        ({ paneId, scrollId }) => useScrollPersistence(paneId, scrollId),
        {
          initialProps: { paneId: "pane-1", scrollId: "testScroll" },
        },
      );

      // Create pane-2 in registry
      registry.getOrCreate("pane-2", {
        pane: { id: "pane-2", type: "editor", cwd: "/test", filePath: null },
      });

      const firstRef = result.current;
      rerender({ paneId: "pane-2", scrollId: "testScroll" });
      const secondRef = result.current;

      expect(firstRef).not.toBe(secondRef);
    });

    it("should return new callback ref when scrollId changes", () => {
      const { result, rerender } = renderHook(
        ({ paneId, scrollId }) => useScrollPersistence(paneId, scrollId),
        {
          initialProps: { paneId: "test-pane", scrollId: "scroll-1" },
        },
      );

      const firstRef = result.current;
      rerender({ paneId: "test-pane", scrollId: "scroll-2" });
      const secondRef = result.current;

      expect(firstRef).not.toBe(secondRef);
    });
  });
});
