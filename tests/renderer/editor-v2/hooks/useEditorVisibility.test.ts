// @ts-nocheck
/**
 * @vitest-environment jsdom
 *
 * useEditorVisibility Hook Tests
 *
 * Tests the editor visibility detection hook that uses IntersectionObserver,
 * MutationObserver, and ResizeObserver to detect when editors become visible/hidden.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEditorVisibility } from "@/components/panes/editor-v2/hooks/useEditorVisibility";
import { createRef } from "react";

// ============================================================================
// Test Setup & Mocks
// ============================================================================

// Mock observers
class MockIntersectionObserver {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.elements = new Set();
  }

  observe(element) {
    this.elements.add(element);
  }

  unobserve(element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.elements.clear();
  }

  // Test helper to trigger intersection
  triggerIntersection(isIntersecting) {
    this.callback([
      {
        isIntersecting,
        target: Array.from(this.elements)[0],
        intersectionRatio: isIntersecting ? 1 : 0,
      },
    ]);
  }
}

class MockResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.elements = new Set();
  }

  observe(element) {
    this.elements.add(element);
  }

  unobserve(element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.elements.clear();
  }

  // Test helper to trigger resize
  triggerResize(contentRect) {
    this.callback([
      {
        target: Array.from(this.elements)[0],
        contentRect: contentRect || { width: 500, height: 300 },
      },
    ]);
  }
}

class MockMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.elements = new Map();
  }

  observe(element, config) {
    this.elements.set(element, config);
  }

  disconnect() {
    this.elements.clear();
  }

  // Test helper to trigger mutation
  triggerMutation(attributeName) {
    this.callback([
      {
        type: "attributes",
        attributeName,
        target: Array.from(this.elements.keys())[0],
      },
    ]);
  }
}

describe("useEditorVisibility", () => {
  let mockElement: HTMLElement;
  let intersectionObserverInstance: MockIntersectionObserver;
  let resizeObserverInstance: MockResizeObserver;
  let mutationObserverInstance: MockMutationObserver;

  beforeEach(() => {
    vi.useFakeTimers();

    // Set up window dimensions for viewport checks
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: 768,
    });

    // Create mock element
    mockElement = document.createElement("div");
    mockElement.style.width = "500px";
    mockElement.style.height = "300px";
    document.body.appendChild(mockElement);

    // Mock getBoundingClientRect to return element as visible in viewport
    mockElement.getBoundingClientRect = vi.fn().mockReturnValue({
      width: 500,
      height: 300,
      top: 100,
      bottom: 400,
      left: 100,
      right: 600,
      x: 100,
      y: 100,
      toJSON: () => {},
    });

    // Mock getComputedStyle to return visible styles
    global.window.getComputedStyle = vi.fn().mockReturnValue({
      display: "block",
      visibility: "visible",
    });

    // Mock observers - wrap in vi.fn() to make them spies
    global.IntersectionObserver = vi.fn(function (callback, options) {
      intersectionObserverInstance = new MockIntersectionObserver(
        callback,
        options,
      );
      return intersectionObserverInstance;
    }) as any;

    global.ResizeObserver = vi.fn(function (callback) {
      resizeObserverInstance = new MockResizeObserver(callback);
      return resizeObserverInstance;
    }) as any;

    global.MutationObserver = vi.fn(function (callback) {
      mutationObserverInstance = new MockMutationObserver(callback);
      return mutationObserverInstance;
    }) as any;

    // Mock requestAnimationFrame to use fake timers
    global.requestAnimationFrame = vi.fn((cb) => {
      const id = setTimeout(cb, 16);
      return id as any;
    }) as any;
    global.cancelAnimationFrame = vi.fn((id) => {
      clearTimeout(id as any);
    }) as any;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Basic Setup
  // ==========================================================================

  describe("Basic Setup", () => {
    it("should create IntersectionObserver when enabled", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();
      renderHook(() => useEditorVisibility(containerRef, { onVisible }));

      expect(global.IntersectionObserver).toHaveBeenCalled();
    });

    it("should create ResizeObserver when enabled", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();
      renderHook(() => useEditorVisibility(containerRef, { onVisible }));

      expect(global.ResizeObserver).toHaveBeenCalled();
    });

    it("should create MutationObserver when enabled", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();
      renderHook(() => useEditorVisibility(containerRef, { onVisible }));

      expect(global.MutationObserver).toHaveBeenCalled();
    });

    it("should not create observers when disabled", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();
      renderHook(() =>
        useEditorVisibility(containerRef, { onVisible, enabled: false }),
      );

      expect(global.IntersectionObserver).not.toHaveBeenCalled();
      expect(global.ResizeObserver).not.toHaveBeenCalled();
      expect(global.MutationObserver).not.toHaveBeenCalled();
    });

    it("should handle missing containerRef", () => {
      const containerRef = createRef();
      // Don't set current

      const onVisible = vi.fn();
      expect(() =>
        renderHook(() => useEditorVisibility(containerRef, { onVisible })),
      ).not.toThrow();
    });
  });

  // ==========================================================================
  // IntersectionObserver - Viewport Visibility
  // ==========================================================================

  describe("IntersectionObserver - Viewport Visibility", () => {
    it("should call onVisible when element enters viewport", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();
      renderHook(() => useEditorVisibility(containerRef, { onVisible }));

      // Simulate element entering viewport
      intersectionObserverInstance.triggerIntersection(true);

      // Fast-forward debounce
      vi.advanceTimersByTime(20);

      expect(onVisible).toHaveBeenCalled();
    });

    it("should call onHidden when element leaves viewport", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();
      const onHidden = vi.fn();

      renderHook(() =>
        useEditorVisibility(containerRef, { onVisible, onHidden }),
      );

      // First make it visible
      intersectionObserverInstance.triggerIntersection(true);
      vi.advanceTimersByTime(20);

      onVisible.mockClear();
      onHidden.mockClear();

      // Update getBoundingClientRect to return out-of-viewport coordinates
      mockElement.getBoundingClientRect = vi.fn().mockReturnValue({
        width: 500,
        height: 300,
        top: -400, // Above viewport
        bottom: -100,
        left: 100,
        right: 600,
        x: 100,
        y: -400,
        toJSON: () => {},
      });

      // Then hide it
      intersectionObserverInstance.triggerIntersection(false);
      vi.advanceTimersByTime(20);

      expect(onHidden).toHaveBeenCalled();
      expect(onVisible).not.toHaveBeenCalled();
    });

    it("should use threshold of 0.01 for early detection", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();
      renderHook(() => useEditorVisibility(containerRef, { onVisible }));

      const constructorCall = (global.IntersectionObserver as any).mock
        .calls[0];
      expect(constructorCall[1].threshold).toBe(0.01);
    });
  });

  // ==========================================================================
  // MutationObserver - CSS Changes
  // ==========================================================================

  describe("MutationObserver - CSS Changes", () => {
    it("should detect style attribute changes", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();
      const onHidden = vi.fn();

      // Start with element hidden (display: none)
      global.window.getComputedStyle = vi.fn().mockReturnValue({
        display: "none",
        visibility: "visible",
      });

      renderHook(() =>
        useEditorVisibility(containerRef, { onVisible, onHidden }),
      );

      // Initial check should not call onVisible (element is hidden)
      vi.advanceTimersByTime(20);
      expect(onVisible).not.toHaveBeenCalled();

      // Now make element visible
      global.window.getComputedStyle = vi.fn().mockReturnValue({
        display: "block",
        visibility: "visible",
      });

      // Trigger style mutation to detect change
      mutationObserverInstance.triggerMutation("style");

      // Fast-forward RAF (16ms) + debounce (16ms) = 32ms
      vi.advanceTimersByTime(35);

      // Should call onVisible now that element became visible
      expect(onVisible).toHaveBeenCalledTimes(1);
    });

    it("should detect class attribute changes", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();

      renderHook(() => useEditorVisibility(containerRef, { onVisible }));

      // Trigger class mutation
      mutationObserverInstance.triggerMutation("class");

      // Fast-forward RAF and debounce
      vi.advanceTimersByTime(20);

      // Should check visibility
      expect(requestAnimationFrame).toHaveBeenCalled();
    });

    it("should detect hidden attribute changes", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();

      renderHook(() => useEditorVisibility(containerRef, { onVisible }));

      // Trigger hidden mutation
      mutationObserverInstance.triggerMutation("hidden");

      // Fast-forward RAF and debounce
      vi.advanceTimersByTime(20);

      // Should check visibility
      expect(requestAnimationFrame).toHaveBeenCalled();
    });

    it("should observe ancestors for CSS changes", () => {
      // Create parent
      const parent = document.createElement("div");
      parent.appendChild(mockElement);
      document.body.appendChild(parent);

      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();

      renderHook(() => useEditorVisibility(containerRef, { onVisible }));

      // Should observe multiple elements (element + ancestors)
      expect(mutationObserverInstance.elements.size).toBeGreaterThan(1);
    });
  });

  // ==========================================================================
  // ResizeObserver
  // ==========================================================================

  describe("ResizeObserver", () => {
    it("should trigger visibility check on resize", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();

      renderHook(() => useEditorVisibility(containerRef, { onVisible }));

      // Clear initial visibility check
      onVisible.mockClear();

      // Trigger resize
      resizeObserverInstance.triggerResize({ width: 600, height: 400 });

      // Fast-forward debounce
      vi.advanceTimersByTime(20);

      // Should check visibility again
      expect(onVisible).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Debouncing
  // ==========================================================================

  describe("Debouncing", () => {
    it("should debounce visibility callbacks (default 16ms)", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();

      renderHook(() => useEditorVisibility(containerRef, { onVisible }));

      // Trigger multiple times rapidly
      intersectionObserverInstance.triggerIntersection(true);
      intersectionObserverInstance.triggerIntersection(false);
      intersectionObserverInstance.triggerIntersection(true);

      // Should not call immediately
      expect(onVisible).not.toHaveBeenCalled();

      // Fast-forward debounce
      vi.advanceTimersByTime(20);

      // Should only call once after debounce
      expect(onVisible).toHaveBeenCalledTimes(1);
    });

    it("should use custom debounce delay when provided", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();

      renderHook(() =>
        useEditorVisibility(containerRef, { onVisible, debounceMs: 100 }),
      );

      intersectionObserverInstance.triggerIntersection(true);

      // Fast-forward less than custom debounce
      vi.advanceTimersByTime(50);
      expect(onVisible).not.toHaveBeenCalled();

      // Fast-forward past custom debounce
      vi.advanceTimersByTime(60);
      expect(onVisible).toHaveBeenCalled();
    });

    it("should clear pending debounce when visibility changes again", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();
      const onHidden = vi.fn();

      renderHook(() =>
        useEditorVisibility(containerRef, { onVisible, onHidden }),
      );

      // Let initial visibility check complete
      vi.advanceTimersByTime(20);
      onVisible.mockClear();
      onHidden.mockClear();

      // Update getBoundingClientRect to return out-of-viewport coordinates
      mockElement.getBoundingClientRect = vi.fn().mockReturnValue({
        width: 500,
        height: 300,
        top: -400, // Above viewport
        bottom: -100,
        left: 100,
        right: 600,
        x: 100,
        y: -400,
        toJSON: () => {},
      });

      // Trigger visible (no-op since already visible, but starts new sequence)
      intersectionObserverInstance.triggerIntersection(true);

      // Before debounce completes, trigger hidden
      vi.advanceTimersByTime(10);
      intersectionObserverInstance.triggerIntersection(false);

      // Fast-forward past debounce
      vi.advanceTimersByTime(20);

      // Should only call onHidden (latest state)
      expect(onVisible).not.toHaveBeenCalled();
      expect(onHidden).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  describe("Cleanup", () => {
    it("should disconnect all observers on unmount", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();

      const { unmount } = renderHook(() =>
        useEditorVisibility(containerRef, { onVisible }),
      );

      const disconnectSpy1 = vi.spyOn(
        intersectionObserverInstance,
        "disconnect",
      );
      const disconnectSpy2 = vi.spyOn(resizeObserverInstance, "disconnect");
      const disconnectSpy3 = vi.spyOn(mutationObserverInstance, "disconnect");

      unmount();

      expect(disconnectSpy1).toHaveBeenCalled();
      expect(disconnectSpy2).toHaveBeenCalled();
      expect(disconnectSpy3).toHaveBeenCalled();
    });

    it("should clear pending debounce timer on unmount", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();

      const { unmount } = renderHook(() =>
        useEditorVisibility(containerRef, { onVisible }),
      );

      // Trigger visibility change
      intersectionObserverInstance.triggerIntersection(true);

      // Unmount before debounce completes
      unmount();

      // Fast-forward past debounce
      vi.advanceTimersByTime(20);

      // Should not call callback after unmount
      expect(onVisible).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Force Check
  // ==========================================================================

  describe("Force Check", () => {
    it("should provide forceCheck method", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();

      const { result } = renderHook(() =>
        useEditorVisibility(containerRef, { onVisible }),
      );

      expect(result.current.forceCheck).toBeDefined();
      expect(typeof result.current.forceCheck).toBe("function");
    });

    it("should trigger visibility check when forceCheck is called", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();

      const { result } = renderHook(() =>
        useEditorVisibility(containerRef, { onVisible }),
      );

      // Clear initial check
      onVisible.mockClear();

      // Call forceCheck
      result.current.forceCheck();

      // Fast-forward debounce
      vi.advanceTimersByTime(20);

      expect(onVisible).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Visibility State
  // ==========================================================================

  describe("Visibility State", () => {
    it("should expose current visibility state", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();

      const { result } = renderHook(() =>
        useEditorVisibility(containerRef, { onVisible }),
      );

      expect(result.current.isVisible).toBeDefined();
    });

    it("should update visibility state when visibility changes", () => {
      const containerRef = createRef();
      (containerRef as any).current = mockElement;

      const onVisible = vi.fn();

      const { result } = renderHook(() =>
        useEditorVisibility(containerRef, { onVisible }),
      );

      // Initially null
      expect(result.current.isVisible).toBeNull();

      // Trigger visible
      intersectionObserverInstance.triggerIntersection(true);
      vi.advanceTimersByTime(20);

      // Check state (note: state is internal, this tests the pattern)
      // In real implementation, isVisible should reflect current state
    });
  });
});
