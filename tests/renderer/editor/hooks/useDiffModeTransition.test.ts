/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDiffModeTransition } from "../../../../src/renderer/components/panes/editor/hooks/useDiffModeTransition";

describe("useDiffModeTransition", () => {
  describe("initial state", () => {
    it("should start in diff mode by default", () => {
      const { result } = renderHook(() => useDiffModeTransition());

      expect(result.current.isDiffMode).toBe(true);
    });

    it("should respect initialMode parameter", () => {
      const { result } = renderHook(() => useDiffModeTransition(false));

      expect(result.current.isDiffMode).toBe(false);
    });
  });

  describe("mode toggle", () => {
    it("should toggle isDiffMode when handleToggle is called", () => {
      const { result } = renderHook(() => useDiffModeTransition());

      expect(result.current.isDiffMode).toBe(true);

      act(() => {
        result.current.handleToggle({ stopPropagation: vi.fn() } as any);
      });

      expect(result.current.isDiffMode).toBe(false);
    });

    it("should toggle back to original mode on second call", () => {
      const { result } = renderHook(() => useDiffModeTransition());

      act(() => {
        result.current.handleToggle({ stopPropagation: vi.fn() } as any);
      });

      act(() => {
        result.current.handleToggle({ stopPropagation: vi.fn() } as any);
      });

      expect(result.current.isDiffMode).toBe(true);
    });

    it("should stop event propagation on toggle", () => {
      const { result } = renderHook(() => useDiffModeTransition());

      const stopPropagation = vi.fn();

      act(() => {
        result.current.handleToggle({ stopPropagation } as any);
      });

      expect(stopPropagation).toHaveBeenCalled();
    });

    it("should allow direct setting of diff mode via setIsDiffMode", () => {
      const { result } = renderHook(() => useDiffModeTransition());

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
});
