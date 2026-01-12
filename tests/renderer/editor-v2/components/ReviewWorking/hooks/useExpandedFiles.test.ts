/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useExpandedFiles } from "../../../../../../src/renderer/components/panes/editor-v2/components/ReviewWorking/hooks/useExpandedFiles";

// ============================================================================
// Tests
// ============================================================================

describe("useExpandedFiles", () => {
  // ===========================================================================
  // Initial State
  // ===========================================================================

  describe("initial state", () => {
    it("should auto-expand all files by default", () => {
      const files = ["file1.ts", "file2.ts", "file3.ts"];
      const { result } = renderHook(() => useExpandedFiles(files));

      expect(result.current.expandedFiles.has("file1.ts")).toBe(true);
      expect(result.current.expandedFiles.has("file2.ts")).toBe(true);
      expect(result.current.expandedFiles.has("file3.ts")).toBe(true);
      expect(result.current.allExpanded).toBe(true);
      expect(result.current.noneExpanded).toBe(false);
    });

    it("should not auto-expand when autoExpandOnMount is false", () => {
      const files = ["file1.ts", "file2.ts"];
      const { result } = renderHook(() => useExpandedFiles(files, false));

      expect(result.current.expandedFiles.size).toBe(0);
      expect(result.current.allExpanded).toBe(false);
      expect(result.current.noneExpanded).toBe(true);
    });

    it("should handle empty file list", () => {
      const { result } = renderHook(() => useExpandedFiles([]));

      expect(result.current.expandedFiles.size).toBe(0);
      expect(result.current.allExpanded).toBe(false);
      expect(result.current.noneExpanded).toBe(true);
    });
  });

  // ===========================================================================
  // Toggle File
  // ===========================================================================

  describe("toggleFile", () => {
    it("should collapse an expanded file", () => {
      const files = ["file1.ts", "file2.ts"];
      const { result } = renderHook(() => useExpandedFiles(files));

      act(() => {
        result.current.toggleFile("file1.ts");
      });

      expect(result.current.expandedFiles.has("file1.ts")).toBe(false);
      expect(result.current.expandedFiles.has("file2.ts")).toBe(true);
    });

    it("should expand a collapsed file", () => {
      const files = ["file1.ts"];
      const { result } = renderHook(() => useExpandedFiles(files, false));

      act(() => {
        result.current.toggleFile("file1.ts");
      });

      expect(result.current.expandedFiles.has("file1.ts")).toBe(true);
    });
  });

  // ===========================================================================
  // Expand File
  // ===========================================================================

  describe("expandFile", () => {
    it("should expand a collapsed file", () => {
      const files = ["file1.ts", "file2.ts"];
      const { result } = renderHook(() => useExpandedFiles(files, false));

      act(() => {
        result.current.expandFile("file1.ts");
      });

      expect(result.current.expandedFiles.has("file1.ts")).toBe(true);
      expect(result.current.expandedFiles.has("file2.ts")).toBe(false);
    });

    it("should be a no-op if file is already expanded", () => {
      const files = ["file1.ts"];
      const { result } = renderHook(() => useExpandedFiles(files));

      // Get initial reference
      const initialSet = result.current.expandedFiles;

      act(() => {
        result.current.expandFile("file1.ts");
      });

      // Should return same reference (no state change)
      expect(result.current.expandedFiles).toBe(initialSet);
    });

    it("should not affect other files", () => {
      const files = ["file1.ts", "file2.ts", "file3.ts"];
      const { result } = renderHook(() => useExpandedFiles(files, false));

      act(() => {
        result.current.expandFile("file2.ts");
      });

      expect(result.current.expandedFiles.has("file1.ts")).toBe(false);
      expect(result.current.expandedFiles.has("file2.ts")).toBe(true);
      expect(result.current.expandedFiles.has("file3.ts")).toBe(false);
    });
  });

  // ===========================================================================
  // Expand/Collapse All
  // ===========================================================================

  describe("expandAll / collapseAll", () => {
    it("should expand all files", () => {
      const files = ["file1.ts", "file2.ts"];
      const { result } = renderHook(() => useExpandedFiles(files, false));

      act(() => {
        result.current.expandAll(files);
      });

      expect(result.current.allExpanded).toBe(true);
    });

    it("should collapse all files", () => {
      const files = ["file1.ts", "file2.ts"];
      const { result } = renderHook(() => useExpandedFiles(files));

      act(() => {
        result.current.collapseAll();
      });

      expect(result.current.noneExpanded).toBe(true);
    });
  });

  // ===========================================================================
  // Derived State
  // ===========================================================================

  describe("derived state", () => {
    it("should report allExpanded correctly", () => {
      const files = ["file1.ts", "file2.ts"];
      const { result } = renderHook(() => useExpandedFiles(files));

      expect(result.current.allExpanded).toBe(true);

      act(() => {
        result.current.toggleFile("file1.ts");
      });

      expect(result.current.allExpanded).toBe(false);
    });

    it("should report noneExpanded correctly", () => {
      const files = ["file1.ts"];
      const { result } = renderHook(() => useExpandedFiles(files));

      expect(result.current.noneExpanded).toBe(false);

      act(() => {
        result.current.collapseAll();
      });

      expect(result.current.noneExpanded).toBe(true);
    });
  });
});
