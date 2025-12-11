/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDiffModeTransition } from "../../../../src/renderer/components/panes/editor-v2/hooks/useDiffModeTransition";

// ============================================================================
// Test Setup
// ============================================================================

const DEFAULT_CONFIG = { minHeight: 100, maxHeight: 400 };

describe("useDiffModeTransition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Initial State
  // ===========================================================================

  describe("initial state", () => {
    it("should start in diff mode by default", () => {
      const { result } = renderHook(() =>
        useDiffModeTransition({ defaultConfig: DEFAULT_CONFIG }),
      );

      expect(result.current.isDiffMode).toBe(true);
    });

    it("should respect initialMode option", () => {
      const { result } = renderHook(() =>
        useDiffModeTransition({
          defaultConfig: DEFAULT_CONFIG,
          initialMode: false,
        }),
      );

      expect(result.current.isDiffMode).toBe(false);
    });

    it("should not be transitioning initially", () => {
      const { result } = renderHook(() =>
        useDiffModeTransition({ defaultConfig: DEFAULT_CONFIG }),
      );

      expect(result.current.isTransitioning).toBe(false);
    });

    it("should return default autoSize config initially", () => {
      const { result } = renderHook(() =>
        useDiffModeTransition({ defaultConfig: DEFAULT_CONFIG }),
      );

      expect(result.current.autoSizeConfig).toEqual(DEFAULT_CONFIG);
    });

    it("should return undefined transitionStyle initially", () => {
      const { result } = renderHook(() =>
        useDiffModeTransition({ defaultConfig: DEFAULT_CONFIG }),
      );

      expect(result.current.transitionStyle).toBeUndefined();
    });

    it("should provide a containerRef", () => {
      const { result } = renderHook(() =>
        useDiffModeTransition({ defaultConfig: DEFAULT_CONFIG }),
      );

      expect(result.current.containerRef).toBeDefined();
      expect(result.current.containerRef.current).toBeNull();
    });
  });

  // ===========================================================================
  // Mode Toggle
  // ===========================================================================

  describe("mode toggle", () => {
    it("should toggle isDiffMode when handleToggle is called", () => {
      const { result } = renderHook(() =>
        useDiffModeTransition({ defaultConfig: DEFAULT_CONFIG }),
      );

      expect(result.current.isDiffMode).toBe(true);

      act(() => {
        result.current.handleToggle({ stopPropagation: vi.fn() } as any);
      });

      expect(result.current.isDiffMode).toBe(false);
    });

    it("should toggle back to original mode on second call", () => {
      const { result } = renderHook(() =>
        useDiffModeTransition({ defaultConfig: DEFAULT_CONFIG }),
      );

      act(() => {
        result.current.handleToggle({ stopPropagation: vi.fn() } as any);
      });

      act(() => {
        result.current.handleToggle({ stopPropagation: vi.fn() } as any);
      });

      expect(result.current.isDiffMode).toBe(true);
    });

    it("should stop event propagation on toggle", () => {
      const { result } = renderHook(() =>
        useDiffModeTransition({ defaultConfig: DEFAULT_CONFIG }),
      );

      const stopPropagation = vi.fn();

      act(() => {
        result.current.handleToggle({ stopPropagation } as any);
      });

      expect(stopPropagation).toHaveBeenCalled();
    });

    it("should allow direct setting of diff mode via setIsDiffMode", () => {
      const { result } = renderHook(() =>
        useDiffModeTransition({ defaultConfig: DEFAULT_CONFIG }),
      );

      act(() => {
        result.current.setIsDiffMode(false);
      });

      expect(result.current.isDiffMode).toBe(false);

      act(() => {
        result.current.setIsDiffMode(true);
      });

      expect(result.current.isDiffMode).toBe(true);
    });
  });

  // ===========================================================================
  // Height Preservation During Transition
  // ===========================================================================

  describe("height preservation during transition", () => {
    it("should capture height and lock autoSizeConfig during transition", () => {
      const { result } = renderHook(() =>
        useDiffModeTransition({ defaultConfig: DEFAULT_CONFIG }),
      );

      // Create a mock container element with height
      const mockContainer = {
        offsetHeight: 250,
      };
      (result.current.containerRef as any).current = mockContainer;

      act(() => {
        result.current.handleToggle({ stopPropagation: vi.fn() } as any);
      });

      // During transition, autoSizeConfig should be locked to captured height
      expect(result.current.autoSizeConfig).toEqual({
        minHeight: 250,
        maxHeight: 250,
      });
      expect(result.current.isTransitioning).toBe(true);
    });

    it("should set transitionStyle during transition", () => {
      const { result } = renderHook(() =>
        useDiffModeTransition({ defaultConfig: DEFAULT_CONFIG }),
      );

      const mockContainer = { offsetHeight: 300 };
      (result.current.containerRef as any).current = mockContainer;

      act(() => {
        result.current.handleToggle({ stopPropagation: vi.fn() } as any);
      });

      expect(result.current.transitionStyle).toEqual({ minHeight: 300 });
    });

    it("should release lock after transition duration", () => {
      const { result } = renderHook(() =>
        useDiffModeTransition({ defaultConfig: DEFAULT_CONFIG }),
      );

      const mockContainer = { offsetHeight: 250 };
      (result.current.containerRef as any).current = mockContainer;

      act(() => {
        result.current.handleToggle({ stopPropagation: vi.fn() } as any);
      });

      expect(result.current.isTransitioning).toBe(true);

      // Fast-forward past transition duration (200ms)
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.isTransitioning).toBe(false);
      expect(result.current.autoSizeConfig).toEqual(DEFAULT_CONFIG);
      expect(result.current.transitionStyle).toBeUndefined();
    });

    it("should not lock height if container ref is not set", () => {
      const { result } = renderHook(() =>
        useDiffModeTransition({ defaultConfig: DEFAULT_CONFIG }),
      );

      // containerRef.current is null

      act(() => {
        result.current.handleToggle({ stopPropagation: vi.fn() } as any);
      });

      // Should still toggle mode but not lock height
      expect(result.current.isDiffMode).toBe(false);
      expect(result.current.autoSizeConfig).toEqual(DEFAULT_CONFIG);
      expect(result.current.isTransitioning).toBe(false);
    });
  });

  // ===========================================================================
  // Config Changes
  // ===========================================================================

  describe("config changes", () => {
    it("should update autoSizeConfig when defaultConfig changes", () => {
      const { result, rerender } = renderHook(
        ({ config }) => useDiffModeTransition({ defaultConfig: config }),
        { initialProps: { config: DEFAULT_CONFIG } },
      );

      expect(result.current.autoSizeConfig).toEqual(DEFAULT_CONFIG);

      const newConfig = { minHeight: 200, maxHeight: 600 };
      rerender({ config: newConfig });

      expect(result.current.autoSizeConfig).toEqual(newConfig);
    });
  });
});
