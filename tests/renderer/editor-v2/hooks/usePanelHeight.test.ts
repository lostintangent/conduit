/**
 * Tests for the usePanelHeight hook.
 *
 * These tests verify the panel height persistence hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePanelHeight } from "@/components/panes/editor-v2/hooks/usePanelHeight";

// =============================================================================
// Mock localStorage
// =============================================================================

const mockStorage: Record<string, string> = {};

const mockLocalStorage = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    for (const key in mockStorage) {
      delete mockStorage[key];
    }
  }),
};

// =============================================================================
// Tests
// =============================================================================

describe("usePanelHeight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clear mock storage
    for (const key in mockStorage) {
      delete mockStorage[key];
    }
    // Setup localStorage mock
    vi.stubGlobal("localStorage", mockLocalStorage);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("initialization", () => {
    it("should use default height when no stored value", () => {
      const { result } = renderHook(() =>
        usePanelHeight({
          storageKey: "test-height",
          defaultHeight: 200,
        }),
      );

      expect(result.current.height).toBe(200);
    });

    it("should use stored value when available", () => {
      mockStorage["test-height"] = "300";

      const { result } = renderHook(() =>
        usePanelHeight({
          storageKey: "test-height",
          defaultHeight: 200,
        }),
      );

      expect(result.current.height).toBe(300);
    });

    it("should clamp stored value to min", () => {
      mockStorage["test-height"] = "50";

      const { result } = renderHook(() =>
        usePanelHeight({
          storageKey: "test-height",
          defaultHeight: 200,
          minHeight: 100,
        }),
      );

      expect(result.current.height).toBe(100);
    });

    it("should clamp stored value to max", () => {
      mockStorage["test-height"] = "1000";

      const { result } = renderHook(() =>
        usePanelHeight({
          storageKey: "test-height",
          defaultHeight: 200,
          maxHeight: 500,
        }),
      );

      expect(result.current.height).toBe(500);
    });

    it("should clamp default height to constraints", () => {
      const { result } = renderHook(() =>
        usePanelHeight({
          storageKey: "test-height",
          defaultHeight: 50,
          minHeight: 100,
          maxHeight: 500,
        }),
      );

      expect(result.current.height).toBe(100);
    });

    it("should handle invalid stored value", () => {
      mockStorage["test-height"] = "invalid";

      const { result } = renderHook(() =>
        usePanelHeight({
          storageKey: "test-height",
          defaultHeight: 200,
        }),
      );

      expect(result.current.height).toBe(200);
    });
  });

  describe("setHeight", () => {
    it("should update height", () => {
      const { result } = renderHook(() =>
        usePanelHeight({
          storageKey: "test-height",
          defaultHeight: 200,
        }),
      );

      act(() => {
        result.current.setHeight(300);
      });

      expect(result.current.height).toBe(300);
    });

    it("should clamp height to min", () => {
      const { result } = renderHook(() =>
        usePanelHeight({
          storageKey: "test-height",
          defaultHeight: 200,
          minHeight: 100,
        }),
      );

      act(() => {
        result.current.setHeight(50);
      });

      expect(result.current.height).toBe(100);
    });

    it("should clamp height to max", () => {
      const { result } = renderHook(() =>
        usePanelHeight({
          storageKey: "test-height",
          defaultHeight: 200,
          maxHeight: 500,
        }),
      );

      act(() => {
        result.current.setHeight(600);
      });

      expect(result.current.height).toBe(500);
    });

    it("should debounce storage writes", () => {
      const { result } = renderHook(() =>
        usePanelHeight({
          storageKey: "test-height",
          defaultHeight: 200,
          debounceMs: 100,
        }),
      );

      act(() => {
        result.current.setHeight(300);
      });

      // Storage not written yet
      expect(mockLocalStorage.setItem).not.toHaveBeenCalled();

      // Advance time
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Now it should be written
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "test-height",
        "300",
      );
    });

    it("should only write once for multiple rapid updates", () => {
      // Clear any previous mock calls
      mockLocalStorage.setItem.mockClear();

      const { result } = renderHook(() =>
        usePanelHeight({
          storageKey: "test-height-rapid",
          defaultHeight: 200,
          debounceMs: 100,
        }),
      );

      act(() => {
        result.current.setHeight(250);
        result.current.setHeight(300);
        result.current.setHeight(350);
      });

      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Should only write the final value
      expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(1);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "test-height-rapid",
        "350",
      );
    });
  });

  describe("resetHeight", () => {
    it("should reset to default height", () => {
      mockStorage["test-height"] = "400";

      const { result } = renderHook(() =>
        usePanelHeight({
          storageKey: "test-height",
          defaultHeight: 200,
        }),
      );

      expect(result.current.height).toBe(400);

      act(() => {
        result.current.resetHeight();
      });

      expect(result.current.height).toBe(200);
    });

    it("should remove stored value", () => {
      mockStorage["test-height"] = "400";

      const { result } = renderHook(() =>
        usePanelHeight({
          storageKey: "test-height",
          defaultHeight: 200,
        }),
      );

      act(() => {
        result.current.resetHeight();
      });

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith("test-height");
    });
  });

  describe("constraints", () => {
    it("should expose minHeight", () => {
      const { result } = renderHook(() =>
        usePanelHeight({
          storageKey: "test-height",
          defaultHeight: 200,
          minHeight: 150,
        }),
      );

      expect(result.current.minHeight).toBe(150);
    });

    it("should expose maxHeight", () => {
      const { result } = renderHook(() =>
        usePanelHeight({
          storageKey: "test-height",
          defaultHeight: 200,
          maxHeight: 450,
        }),
      );

      expect(result.current.maxHeight).toBe(450);
    });

    it("should use default min/max when not provided", () => {
      const { result } = renderHook(() =>
        usePanelHeight({
          storageKey: "test-height",
          defaultHeight: 200,
        }),
      );

      expect(result.current.minHeight).toBe(100);
      expect(result.current.maxHeight).toBe(600);
    });
  });

  describe("error handling", () => {
    it("should handle localStorage not available on read", () => {
      mockLocalStorage.getItem.mockImplementationOnce(() => {
        throw new Error("localStorage not available");
      });

      const { result } = renderHook(() =>
        usePanelHeight({
          storageKey: "test-height",
          defaultHeight: 200,
        }),
      );

      // Should fall back to default
      expect(result.current.height).toBe(200);
    });

    it("should handle localStorage not available on write", () => {
      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw new Error("localStorage not available");
      });

      const { result } = renderHook(() =>
        usePanelHeight({
          storageKey: "test-height",
          defaultHeight: 200,
        }),
      );

      // Should not throw
      act(() => {
        result.current.setHeight(300);
        vi.advanceTimersByTime(300);
      });

      expect(result.current.height).toBe(300);
    });
  });
});
