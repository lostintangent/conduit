/**
 * useExpandedPaths Hook Tests
 *
 * Tests the hook that manages expanded directory state in file trees.
 * Key features tested:
 * - Basic expand/collapse functionality
 * - Case-insensitive path handling on macOS/Windows
 * - expandToFile functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ============================================================================
// Mock Setup
// ============================================================================

// Mock the pathUtils to ensure case-insensitive behavior for testing
// This simulates macOS/Windows behavior
vi.mock("@/utils/pathUtils", () => ({
  isCaseInsensitiveFs: true,
  normalizePathForKey: (path: string) => path.toLowerCase(),
  pathsEqual: (
    path1: string | null | undefined,
    path2: string | null | undefined,
  ) => {
    if (path1 == null || path2 == null) {
      return path1 === path2;
    }
    return path1.toLowerCase() === path2.toLowerCase();
  },
}));

import { useExpandedPaths } from "@/components/panes/editor-v2/hooks/useExpandedPaths";

describe("useExpandedPaths", () => {
  // These tests run with case-insensitive mock, simulating macOS/Windows

  // ==========================================================================
  // Basic Functionality
  // ==========================================================================

  describe("basic functionality", () => {
    it("should initialize with provided paths", () => {
      const { result } = renderHook(() =>
        useExpandedPaths({ initialPaths: ["/project/src"] }),
      );

      expect(result.current.isExpanded("/project/src")).toBe(true);
      expect(result.current.isExpanded("/project/other")).toBe(false);
    });

    it("should initialize with empty set by default", () => {
      const { result } = renderHook(() => useExpandedPaths());

      expect(result.current.expandedPaths.size).toBe(0);
    });

    it("should toggle path expanded state", () => {
      const { result } = renderHook(() => useExpandedPaths());

      act(() => {
        result.current.toggle("/project/src");
      });
      expect(result.current.isExpanded("/project/src")).toBe(true);

      act(() => {
        result.current.toggle("/project/src");
      });
      expect(result.current.isExpanded("/project/src")).toBe(false);
    });

    it("should expand a path without toggling", () => {
      const { result } = renderHook(() => useExpandedPaths());

      act(() => {
        result.current.expand("/project/src");
      });
      expect(result.current.isExpanded("/project/src")).toBe(true);

      // Calling expand again should not toggle it off
      act(() => {
        result.current.expand("/project/src");
      });
      expect(result.current.isExpanded("/project/src")).toBe(true);
    });

    it("should collapse a path without toggling", () => {
      const { result } = renderHook(() =>
        useExpandedPaths({ initialPaths: ["/project/src"] }),
      );

      act(() => {
        result.current.collapse("/project/src");
      });
      expect(result.current.isExpanded("/project/src")).toBe(false);

      // Calling collapse again should not toggle it on
      act(() => {
        result.current.collapse("/project/src");
      });
      expect(result.current.isExpanded("/project/src")).toBe(false);
    });

    it("should reset to initial paths", () => {
      const { result } = renderHook(() =>
        useExpandedPaths({ initialPaths: ["/project"] }),
      );

      act(() => {
        result.current.expand("/project/src");
        result.current.expand("/project/lib");
      });
      expect(result.current.expandedPaths.size).toBe(3);

      act(() => {
        result.current.reset();
      });
      expect(result.current.expandedPaths.size).toBe(1);
      expect(result.current.isExpanded("/project")).toBe(true);
    });

    it("should reset to custom paths", () => {
      const { result } = renderHook(() =>
        useExpandedPaths({ initialPaths: ["/project"] }),
      );

      act(() => {
        result.current.reset(["/other", "/another"]);
      });
      expect(result.current.expandedPaths.size).toBe(2);
      expect(result.current.isExpanded("/other")).toBe(true);
      expect(result.current.isExpanded("/another")).toBe(true);
    });
  });

  // ==========================================================================
  // Case Sensitivity (macOS)
  // ==========================================================================

  describe("case sensitivity on macOS", () => {
    // These tests verify that paths are compared case-insensitively
    // which is important for macOS where the filesystem is case-insensitive

    it("should treat paths with different casing as equal in isExpanded", () => {
      const { result } = renderHook(() =>
        useExpandedPaths({ initialPaths: ["/Project/Src"] }),
      );

      expect(result.current.isExpanded("/project/src")).toBe(true);
      expect(result.current.isExpanded("/PROJECT/SRC")).toBe(true);
      expect(result.current.isExpanded("/Project/Src")).toBe(true);
    });

    it("should toggle correctly with different casing", () => {
      const { result } = renderHook(() => useExpandedPaths());

      act(() => {
        result.current.toggle("/Project/Src");
      });
      expect(result.current.isExpanded("/project/src")).toBe(true);

      // Toggle off with different casing
      act(() => {
        result.current.toggle("/PROJECT/SRC");
      });
      expect(result.current.isExpanded("/Project/Src")).toBe(false);
    });

    it("should expand with different casing than initial check", () => {
      const { result } = renderHook(() => useExpandedPaths());

      act(() => {
        result.current.expand("/Project/Src");
      });

      // Check with different casing
      expect(result.current.isExpanded("/project/src")).toBe(true);
    });

    it("should collapse with different casing than expand", () => {
      const { result } = renderHook(() => useExpandedPaths());

      act(() => {
        result.current.expand("/Project/Src");
      });

      act(() => {
        result.current.collapse("/project/src");
      });

      expect(result.current.isExpanded("/PROJECT/SRC")).toBe(false);
    });

    it("should not create duplicate entries for different casings", () => {
      const { result } = renderHook(() => useExpandedPaths());

      act(() => {
        result.current.expand("/Project/Src");
        result.current.expand("/project/src");
        result.current.expand("/PROJECT/SRC");
      });

      // Should only have one entry, not three
      expect(result.current.expandedPaths.size).toBe(1);
    });
  });

  // ==========================================================================
  // expandToFile
  // ==========================================================================

  describe("expandToFile", () => {
    it("should expand all parent directories to reveal a file", () => {
      const { result } = renderHook(() => useExpandedPaths());

      act(() => {
        result.current.expandToFile(
          "/project/src/utils/helpers/file.ts",
          "/project",
        );
      });

      expect(result.current.isExpanded("/project/src")).toBe(true);
      expect(result.current.isExpanded("/project/src/utils")).toBe(true);
      expect(result.current.isExpanded("/project/src/utils/helpers")).toBe(
        true,
      );
      // The file itself should NOT be expanded (it's a file, not a directory)
      expect(
        result.current.isExpanded("/project/src/utils/helpers/file.ts"),
      ).toBe(false);
    });

    it("should not expand paths above rootPath", () => {
      const { result } = renderHook(() => useExpandedPaths());

      act(() => {
        result.current.expandToFile("/project/src/file.ts", "/project/src");
      });

      // Should NOT expand /project (above root)
      expect(result.current.isExpanded("/project")).toBe(false);
      // The root itself should NOT be in parents
      expect(result.current.isExpanded("/project/src")).toBe(false);
    });

    it("should handle case sensitivity in expandToFile", () => {
      const { result } = renderHook(() => useExpandedPaths());

      act(() => {
        result.current.expandToFile("/Project/Src/Utils/file.ts", "/Project");
      });

      // Check with different casing
      expect(result.current.isExpanded("/project/src")).toBe(true);
      expect(result.current.isExpanded("/PROJECT/SRC/UTILS")).toBe(true);
    });

    it("should not re-add already expanded paths", () => {
      const { result } = renderHook(() =>
        useExpandedPaths({ initialPaths: ["/project/src"] }),
      );

      const initialSize = result.current.expandedPaths.size;

      act(() => {
        result.current.expandToFile("/project/src/file.ts", "/project");
      });

      // Should not have increased size since /project/src was already expanded
      expect(result.current.expandedPaths.size).toBe(initialSize);
    });
  });

  // ==========================================================================
  // expandToFiles
  // ==========================================================================

  describe("expandToFiles", () => {
    it("should expand parents for multiple files", () => {
      const { result } = renderHook(() => useExpandedPaths());

      act(() => {
        result.current.expandToFiles(
          ["/project/src/a/file1.ts", "/project/lib/b/file2.ts"],
          "/project",
        );
      });

      expect(result.current.isExpanded("/project/src")).toBe(true);
      expect(result.current.isExpanded("/project/src/a")).toBe(true);
      expect(result.current.isExpanded("/project/lib")).toBe(true);
      expect(result.current.isExpanded("/project/lib/b")).toBe(true);
    });

    it("should handle empty array", () => {
      const { result } = renderHook(() => useExpandedPaths());

      act(() => {
        result.current.expandToFiles([], "/project");
      });

      expect(result.current.expandedPaths.size).toBe(0);
    });

    it("should deduplicate shared parent paths", () => {
      const { result } = renderHook(() => useExpandedPaths());

      act(() => {
        result.current.expandToFiles(
          ["/project/src/a/file1.ts", "/project/src/a/file2.ts"],
          "/project",
        );
      });

      // /project/src and /project/src/a should only be added once
      expect(result.current.expandedPaths.size).toBe(2);
    });
  });

  // ==========================================================================
  // Callback Stability
  // ==========================================================================

  describe("callback stability", () => {
    it("should return stable callbacks across re-renders", () => {
      const { result, rerender } = renderHook(() => useExpandedPaths());

      const firstCallbacks = {
        isExpanded: result.current.isExpanded,
        toggle: result.current.toggle,
        expand: result.current.expand,
        collapse: result.current.collapse,
        expandToFile: result.current.expandToFile,
        expandToFiles: result.current.expandToFiles,
        reset: result.current.reset,
      };

      rerender();

      // toggle, expand, collapse, expandToFile, expandToFiles, reset should be stable
      expect(result.current.toggle).toBe(firstCallbacks.toggle);
      expect(result.current.expand).toBe(firstCallbacks.expand);
      expect(result.current.collapse).toBe(firstCallbacks.collapse);
      expect(result.current.expandToFile).toBe(firstCallbacks.expandToFile);
      expect(result.current.expandToFiles).toBe(firstCallbacks.expandToFiles);
      // reset depends on initialPaths, so stability depends on that

      // isExpanded may change as it depends on expandedPaths state
    });
  });
});
