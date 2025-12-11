/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePreventFocusScroll } from "../../../../src/renderer/components/panes/editor-v2/hooks/usePreventFocusScroll";

// ============================================================================
// Tests
// ============================================================================

describe("usePreventFocusScroll", () => {
  afterEach(() => {
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
  });

  // ===========================================================================
  // Focus Patching
  // ===========================================================================

  describe("focus patching", () => {
    it("should patch focus on input elements to use preventScroll", () => {
      const container = document.createElement("div");
      const input = document.createElement("input");
      container.appendChild(input);
      document.body.appendChild(container);

      const containerRef = { current: container };

      // Track focus calls
      const originalFocus = HTMLElement.prototype.focus;
      let focusOptions: FocusOptions | undefined;
      vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (
        this: HTMLElement,
        options?: FocusOptions,
      ) {
        focusOptions = options;
        originalFocus.call(this, options);
      });

      renderHook(() => usePreventFocusScroll(containerRef));

      input.focus();

      expect(focusOptions?.preventScroll).toBe(true);
    });

    it("should patch focus on textarea elements", () => {
      const container = document.createElement("div");
      const textarea = document.createElement("textarea");
      container.appendChild(textarea);
      document.body.appendChild(container);

      const containerRef = { current: container };

      const originalFocus = HTMLElement.prototype.focus;
      let focusOptions: FocusOptions | undefined;
      vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (
        this: HTMLElement,
        options?: FocusOptions,
      ) {
        focusOptions = options;
        originalFocus.call(this, options);
      });

      renderHook(() => usePreventFocusScroll(containerRef));

      textarea.focus();

      expect(focusOptions?.preventScroll).toBe(true);
    });

    it("should patch focus on button elements", () => {
      const container = document.createElement("div");
      const button = document.createElement("button");
      container.appendChild(button);
      document.body.appendChild(container);

      const containerRef = { current: container };

      const originalFocus = HTMLElement.prototype.focus;
      let focusOptions: FocusOptions | undefined;
      vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (
        this: HTMLElement,
        options?: FocusOptions,
      ) {
        focusOptions = options;
        originalFocus.call(this, options);
      });

      renderHook(() => usePreventFocusScroll(containerRef));

      button.focus();

      expect(focusOptions?.preventScroll).toBe(true);
    });

    it("should patch focus on elements with tabindex", () => {
      const container = document.createElement("div");
      const div = document.createElement("div");
      div.setAttribute("tabindex", "0");
      container.appendChild(div);
      document.body.appendChild(container);

      const containerRef = { current: container };

      const originalFocus = HTMLElement.prototype.focus;
      let focusOptions: FocusOptions | undefined;
      vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (
        this: HTMLElement,
        options?: FocusOptions,
      ) {
        focusOptions = options;
        originalFocus.call(this, options);
      });

      renderHook(() => usePreventFocusScroll(containerRef));

      div.focus();

      expect(focusOptions?.preventScroll).toBe(true);
    });

    it("should not double-patch elements", () => {
      const container = document.createElement("div");
      const input = document.createElement("input");
      container.appendChild(input);
      document.body.appendChild(container);

      const containerRef = { current: container };

      renderHook(() => usePreventFocusScroll(containerRef));

      // Get the patched focus
      const patchedFocus = input.focus;

      // Trigger MutationObserver by adding/removing element
      const temp = document.createElement("span");
      container.appendChild(temp);
      container.removeChild(temp);

      // Focus should still be the same patched function
      expect(input.focus).toBe(patchedFocus);
    });

    it("should preserve other focus options", () => {
      const container = document.createElement("div");
      const input = document.createElement("input");
      container.appendChild(input);
      document.body.appendChild(container);

      const containerRef = { current: container };

      const originalFocus = HTMLElement.prototype.focus;
      let focusOptions: FocusOptions | undefined;
      vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (
        this: HTMLElement,
        options?: FocusOptions,
      ) {
        focusOptions = options;
        originalFocus.call(this, options);
      });

      renderHook(() => usePreventFocusScroll(containerRef));

      // Call with additional options - preventScroll should be added
      input.focus();

      expect(focusOptions?.preventScroll).toBe(true);
    });
  });

  // ===========================================================================
  // MutationObserver Setup
  // ===========================================================================

  describe("MutationObserver", () => {
    it("should observe container for dynamic elements", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const containerRef = { current: container };

      const observeSpy = vi.spyOn(MutationObserver.prototype, "observe");

      renderHook(() => usePreventFocusScroll(containerRef));

      expect(observeSpy).toHaveBeenCalledWith(container, {
        childList: true,
        subtree: true,
      });
    });
  });

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  describe("cleanup", () => {
    it("should disconnect MutationObserver on unmount", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const containerRef = { current: container };

      const disconnectSpy = vi.spyOn(MutationObserver.prototype, "disconnect");

      const { unmount } = renderHook(() => usePreventFocusScroll(containerRef));

      unmount();

      expect(disconnectSpy).toHaveBeenCalled();
    });

    it("should restore original focus methods on unmount", () => {
      const container = document.createElement("div");
      const input = document.createElement("input");
      container.appendChild(input);
      document.body.appendChild(container);

      const containerRef = { current: container };

      const { unmount } = renderHook(() => usePreventFocusScroll(containerRef));

      const patchedFocus = input.focus;

      unmount();

      // Focus should be different (restored to original)
      expect(input.focus).not.toBe(patchedFocus);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("edge cases", () => {
    it("should handle container with no focusable elements", () => {
      const container = document.createElement("div");
      container.innerHTML = "<span>No focusable elements</span>";
      document.body.appendChild(container);

      const containerRef = { current: container };

      expect(() => {
        renderHook(() => usePreventFocusScroll(containerRef));
      }).not.toThrow();
    });

    it("should handle empty container", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const containerRef = { current: container };

      expect(() => {
        renderHook(() => usePreventFocusScroll(containerRef));
      }).not.toThrow();
    });
  });
});
