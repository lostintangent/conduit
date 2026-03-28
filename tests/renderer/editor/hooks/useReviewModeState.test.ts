/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReviewModeState } from "../../../../src/renderer/components/panes/editor/hooks/useReviewModeState";

// ============================================================================
// Tests
// ============================================================================

describe("useReviewModeState", () => {
  // ===========================================================================
  // Initial State
  // ===========================================================================

  describe("initial state", () => {
    it("should start in editor mode", () => {
      const { result } = renderHook(() => useReviewModeState());

      expect(result.current.viewMode).toEqual({ type: "editor" });
      expect(result.current.isReviewMode).toBe(false);
    });
  });

  // ===========================================================================
  // Enter/Exit Review Mode
  // ===========================================================================

  describe("enter/exit review mode", () => {
    it("should enter review mode", () => {
      const { result } = renderHook(() => useReviewModeState());

      act(() => {
        result.current.enterReviewMode();
      });

      expect(result.current.viewMode).toEqual({ type: "changesReview" });
      expect(result.current.isReviewMode).toBe(true);
    });

    it("should enter review mode with baseBranch", () => {
      const { result } = renderHook(() => useReviewModeState());

      act(() => {
        result.current.enterReviewMode("main");
      });

      expect(result.current.viewMode).toEqual({
        type: "changesReview",
        baseBranch: "main",
      });
    });

    it("should exit review mode", () => {
      const { result } = renderHook(() => useReviewModeState());

      act(() => {
        result.current.enterReviewMode();
      });

      act(() => {
        result.current.exitReviewMode();
      });

      expect(result.current.viewMode).toEqual({ type: "editor" });
      expect(result.current.isReviewMode).toBe(false);
    });
  });

  // ===========================================================================
  // Set View Mode
  // ===========================================================================

  describe("setViewMode", () => {
    it("should set view mode directly", () => {
      const { result } = renderHook(() => useReviewModeState());

      act(() => {
        result.current.setViewMode({
          type: "diff",
          filePath: "/test/file.ts",
        });
      });

      expect(result.current.viewMode).toEqual({
        type: "diff",
        filePath: "/test/file.ts",
      });
    });

    it("should allow exiting review mode via setViewMode", () => {
      const { result } = renderHook(() => useReviewModeState());

      act(() => {
        result.current.enterReviewMode();
      });

      act(() => {
        result.current.setViewMode({ type: "editor" });
      });

      expect(result.current.isReviewMode).toBe(false);
    });
  });

  // ===========================================================================
  // Set View Mode Preserving Review
  // ===========================================================================

  describe("setViewModePreservingReview", () => {
    it("should set view mode when not in review mode", () => {
      const { result } = renderHook(() => useReviewModeState());

      act(() => {
        result.current.setViewModePreservingReview(() => ({
          type: "diff",
          filePath: "/test/file.ts",
        }));
      });

      expect(result.current.viewMode).toEqual({
        type: "diff",
        filePath: "/test/file.ts",
      });
    });

    it("should preserve review mode when in review mode", () => {
      const { result } = renderHook(() => useReviewModeState());

      act(() => {
        result.current.enterReviewMode("main");
      });

      act(() => {
        result.current.setViewModePreservingReview(() => ({
          type: "editor",
        }));
      });

      // Should still be in review mode
      expect(result.current.viewMode).toEqual({
        type: "changesReview",
        baseBranch: "main",
      });
      expect(result.current.isReviewMode).toBe(true);
    });
  });

  // ===========================================================================
  // Tree View Mode Transitions
  // ===========================================================================

  describe("handleTreeViewModeTransition", () => {
    it("should exit review mode when switching to files mode", () => {
      const { result } = renderHook(() => useReviewModeState());

      act(() => {
        result.current.enterReviewMode();
      });

      act(() => {
        result.current.handleTreeViewModeTransition("files");
      });

      expect(result.current.isReviewMode).toBe(false);
      expect(result.current.viewMode).toEqual({ type: "editor" });
    });

    it("should remember review mode when switching to files", () => {
      const { result } = renderHook(() => useReviewModeState());

      act(() => {
        result.current.enterReviewMode();
      });

      act(() => {
        result.current.handleTreeViewModeTransition("files");
      });

      // Now switch back to changes - should restore review mode
      act(() => {
        const { restoredReviewMode } =
          result.current.handleTreeViewModeTransition("changes");
        expect(restoredReviewMode).toBe(true);
      });

      expect(result.current.isReviewMode).toBe(true);
    });

    it("should not restore review mode if not previously in review", () => {
      const { result } = renderHook(() => useReviewModeState());

      // Start in editor mode, switch to files, then to changes
      act(() => {
        result.current.handleTreeViewModeTransition("files");
      });

      act(() => {
        const { restoredReviewMode } =
          result.current.handleTreeViewModeTransition("changes");
        expect(restoredReviewMode).toBe(false);
      });

      expect(result.current.isReviewMode).toBe(false);
    });

    it("should clear memory when exitReviewMode is called", () => {
      const { result } = renderHook(() => useReviewModeState());

      // Enter review mode, switch to files (remembers), then explicitly exit
      act(() => {
        result.current.enterReviewMode();
      });

      act(() => {
        result.current.handleTreeViewModeTransition("files");
      });

      // Explicitly exit (should clear memory)
      act(() => {
        result.current.exitReviewMode();
      });

      // Switch back to changes - should NOT restore
      act(() => {
        const { restoredReviewMode } =
          result.current.handleTreeViewModeTransition("changes");
        expect(restoredReviewMode).toBe(false);
      });

      expect(result.current.isReviewMode).toBe(false);
    });

    it("should not affect non-review modes when switching tree modes", () => {
      const { result } = renderHook(() => useReviewModeState());

      // Set to diff mode
      act(() => {
        result.current.setViewMode({
          type: "diff",
          filePath: "/test/file.ts",
        });
      });

      // Switch to files mode
      act(() => {
        result.current.handleTreeViewModeTransition("files");
      });

      // Should still be in diff mode
      expect(result.current.viewMode).toEqual({
        type: "diff",
        filePath: "/test/file.ts",
      });
    });
  });
});
