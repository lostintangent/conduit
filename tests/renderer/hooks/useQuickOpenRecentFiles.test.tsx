import React from "react";
import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, it, expect } from "vitest";
import {
  quickOpenRecentFilesAtom,
  useQuickOpenRecentFiles,
} from "@/hooks/useQuickOpenRecentFiles";

describe("useQuickOpenRecentFiles", () => {
  beforeEach(() => {
    quickOpenRecentFilesAtom.set([]);
  });

  // ==========================================================================
  // Initial State Tests
  // ==========================================================================

  describe("initial state", () => {
    it("should start with empty array", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      expect(result.current.recentFiles).toEqual([]);
    });
  });

  // ==========================================================================
  // addRecentFile Tests
  // ==========================================================================

  describe("addRecentFile", () => {
    it("should add file to front of list", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      act(() => {
        result.current.addRecentFile("/workspace/file1.ts");
      });

      expect(result.current.recentFiles).toEqual(["/workspace/file1.ts"]);

      act(() => {
        result.current.addRecentFile("/workspace/file2.ts");
      });

      expect(result.current.recentFiles).toEqual([
        "/workspace/file2.ts",
        "/workspace/file1.ts",
      ]);
    });

    it("should move existing file to front (LRU behavior)", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      act(() => {
        result.current.addRecentFile("/workspace/file1.ts");
        result.current.addRecentFile("/workspace/file2.ts");
        result.current.addRecentFile("/workspace/file3.ts");
      });

      expect(result.current.recentFiles).toEqual([
        "/workspace/file3.ts",
        "/workspace/file2.ts",
        "/workspace/file1.ts",
      ]);

      // Re-add file1, should move to front
      act(() => {
        result.current.addRecentFile("/workspace/file1.ts");
      });

      expect(result.current.recentFiles).toEqual([
        "/workspace/file1.ts",
        "/workspace/file3.ts",
        "/workspace/file2.ts",
      ]);
    });

    it("should cap at 20 files", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      // Add 25 files
      act(() => {
        for (let i = 1; i <= 25; i++) {
          result.current.addRecentFile(`/workspace/file${i}.ts`);
        }
      });

      // Should only keep last 20
      expect(result.current.recentFiles.length).toBe(20);
      // Most recent should be file25
      expect(result.current.recentFiles[0]).toBe("/workspace/file25.ts");
      // Oldest should be file6 (25 - 20 + 1)
      expect(result.current.recentFiles[19]).toBe("/workspace/file6.ts");
    });

    it("should handle adding same file multiple times", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      act(() => {
        result.current.addRecentFile("/workspace/file1.ts");
        result.current.addRecentFile("/workspace/file1.ts");
        result.current.addRecentFile("/workspace/file1.ts");
      });

      // Should only appear once
      expect(result.current.recentFiles).toEqual(["/workspace/file1.ts"]);
    });

    it("should handle empty string", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      act(() => {
        result.current.addRecentFile("");
      });

      expect(result.current.recentFiles).toEqual([""]);
    });
  });

  // ==========================================================================
  // removeRecentFile Tests
  // ==========================================================================

  describe("removeRecentFile", () => {
    it("should remove specified file", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      act(() => {
        result.current.addRecentFile("/workspace/file1.ts");
        result.current.addRecentFile("/workspace/file2.ts");
        result.current.addRecentFile("/workspace/file3.ts");
      });

      expect(result.current.recentFiles.length).toBe(3);

      act(() => {
        result.current.removeRecentFile("/workspace/file2.ts");
      });

      expect(result.current.recentFiles).toEqual([
        "/workspace/file3.ts",
        "/workspace/file1.ts",
      ]);
    });

    it("should handle removing non-existent file", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      act(() => {
        result.current.addRecentFile("/workspace/file1.ts");
      });

      // Remove file that doesn't exist
      act(() => {
        result.current.removeRecentFile("/workspace/file2.ts");
      });

      // Should not affect existing files
      expect(result.current.recentFiles).toEqual(["/workspace/file1.ts"]);
    });

    it("should handle removing from empty list", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      act(() => {
        result.current.removeRecentFile("/workspace/file1.ts");
      });

      expect(result.current.recentFiles).toEqual([]);
    });

    it("should remove all occurrences if duplicates exist", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      // Manually set state with duplicates (shouldn't happen in practice)
      act(() => {
        result.current.setRecentFiles([
          "/workspace/file1.ts",
          "/workspace/file2.ts",
          "/workspace/file1.ts",
        ]);
      });

      act(() => {
        result.current.removeRecentFile("/workspace/file1.ts");
      });

      expect(result.current.recentFiles).toEqual(["/workspace/file2.ts"]);
    });
  });

  // ==========================================================================
  // setRecentFiles Tests
  // ==========================================================================

  describe("setRecentFiles", () => {
    it("should replace entire list", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      act(() => {
        result.current.addRecentFile("/workspace/file1.ts");
      });

      expect(result.current.recentFiles.length).toBe(1);

      act(() => {
        result.current.setRecentFiles([
          "/workspace/file2.ts",
          "/workspace/file3.ts",
        ]);
      });

      expect(result.current.recentFiles).toEqual([
        "/workspace/file2.ts",
        "/workspace/file3.ts",
      ]);
    });

    it("should cap at 20 files", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      const files = Array.from(
        { length: 25 },
        (_, i) => `/workspace/file${i + 1}.ts`,
      );

      act(() => {
        result.current.setRecentFiles(files);
      });

      // Should only keep last 20
      expect(result.current.recentFiles.length).toBe(20);
      // Should keep the LAST 20 files (not first 20)
      expect(result.current.recentFiles[0]).toBe("/workspace/file6.ts");
      expect(result.current.recentFiles[19]).toBe("/workspace/file25.ts");
    });

    it("should handle empty array", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      act(() => {
        result.current.addRecentFile("/workspace/file1.ts");
      });

      act(() => {
        result.current.setRecentFiles([]);
      });

      expect(result.current.recentFiles).toEqual([]);
    });

    it("should handle array with fewer than 20 items", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      const files = ["/workspace/file1.ts", "/workspace/file2.ts"];

      act(() => {
        result.current.setRecentFiles(files);
      });

      expect(result.current.recentFiles).toEqual(files);
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe("integration scenarios", () => {
    it("should handle mixed operations", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      // Add files
      act(() => {
        result.current.addRecentFile("/workspace/file1.ts");
        result.current.addRecentFile("/workspace/file2.ts");
        result.current.addRecentFile("/workspace/file3.ts");
      });

      expect(result.current.recentFiles.length).toBe(3);

      // Remove middle file
      act(() => {
        result.current.removeRecentFile("/workspace/file2.ts");
      });

      expect(result.current.recentFiles.length).toBe(2);

      // Re-add first file (should move to front)
      act(() => {
        result.current.addRecentFile("/workspace/file1.ts");
      });

      expect(result.current.recentFiles).toEqual([
        "/workspace/file1.ts",
        "/workspace/file3.ts",
      ]);
    });

    it("should maintain order through add/remove cycles", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      // Add files
      act(() => {
        result.current.addRecentFile("/workspace/a.ts");
        result.current.addRecentFile("/workspace/b.ts");
        result.current.addRecentFile("/workspace/c.ts");
        result.current.addRecentFile("/workspace/d.ts");
      });

      // Remove some
      act(() => {
        result.current.removeRecentFile("/workspace/b.ts");
        result.current.removeRecentFile("/workspace/d.ts");
      });

      expect(result.current.recentFiles).toEqual([
        "/workspace/c.ts",
        "/workspace/a.ts",
      ]);

      // Add new files
      act(() => {
        result.current.addRecentFile("/workspace/e.ts");
        result.current.addRecentFile("/workspace/f.ts");
      });

      expect(result.current.recentFiles).toEqual([
        "/workspace/f.ts",
        "/workspace/e.ts",
        "/workspace/c.ts",
        "/workspace/a.ts",
      ]);
    });

    it("should survive setRecentFiles followed by add", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      act(() => {
        result.current.setRecentFiles([
          "/workspace/file1.ts",
          "/workspace/file2.ts",
        ]);
      });

      act(() => {
        result.current.addRecentFile("/workspace/file3.ts");
      });

      expect(result.current.recentFiles).toEqual([
        "/workspace/file3.ts",
        "/workspace/file1.ts",
        "/workspace/file2.ts",
      ]);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("edge cases", () => {
    it("should handle very long file paths", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      const longPath = "/workspace/" + "a".repeat(500) + ".ts";

      act(() => {
        result.current.addRecentFile(longPath);
      });

      expect(result.current.recentFiles).toEqual([longPath]);
    });

    it("should handle paths with special characters", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      const specialPaths = [
        "/workspace/file with spaces.ts",
        "/workspace/file(with)parens.ts",
        "/workspace/file[with]brackets.ts",
        "/workspace/file{with}braces.ts",
      ];

      act(() => {
        specialPaths.forEach((path) => result.current.addRecentFile(path));
      });

      expect(result.current.recentFiles.length).toBe(specialPaths.length);
    });

    it("should handle unicode paths", () => {
      const { result } = renderHook(() => useQuickOpenRecentFiles());

      const unicodePaths = [
        "/workspace/文件.ts",
        "/workspace/файл.ts",
        "/workspace/ファイル.ts",
      ];

      act(() => {
        unicodePaths.forEach((path) => result.current.addRecentFile(path));
      });

      expect(result.current.recentFiles.length).toBe(unicodePaths.length);
    });
  });
});
