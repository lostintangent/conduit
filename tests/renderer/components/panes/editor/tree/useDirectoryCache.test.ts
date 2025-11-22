import type { FileTreeNode, GitStatusMap } from "@shared/types";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDirectoryCache,
  invalidateDirectory,
  useDirectoryCache,
} from "../../../../../../src/renderer/components/panes/editor/tree/useDirectoryCache";

// Mock the conduit API
const mockListDirectory = vi.fn();

const createMockNode = (path: string, relativePath: string): FileTreeNode => ({
  name: relativePath.split("/").pop() || relativePath,
  path,
  relativePath,
  type: "directory",
});

const createMockChildren = (): FileTreeNode[] => [
  {
    name: "file1.ts",
    path: "/repo/src/file1.ts",
    relativePath: "src/file1.ts",
    type: "file",
  },
  {
    name: "file2.ts",
    path: "/repo/src/file2.ts",
    relativePath: "src/file2.ts",
    type: "file",
  },
  {
    name: "components",
    path: "/repo/src/components",
    relativePath: "src/components",
    type: "directory",
  },
];

describe("useDirectoryCache", () => {
  beforeEach(() => {
    // Mock window.conduit
    (window as any).conduit = {
      listDirectory: mockListDirectory,
    };
    vi.clearAllMocks();
    mockListDirectory.mockResolvedValue(createMockChildren());
    // Clear module-level cache between tests
    clearDirectoryCache();
  });

  afterEach(() => {
    // Clean up conduit mock
    delete (window as any).conduit;
    vi.clearAllMocks();
  });

  describe("Initial loading", () => {
    it("should load children when expanded", async () => {
      const node = createMockNode("/repo/src", "src");

      const { result } = renderHook(() =>
        useDirectoryCache({
          node,
          rootPath: "/repo",
          isExpanded: true,
          prefetch: false,
        }),
      );

      // Initially loading
      expect(result.current.isLoading).toBe(true);
      expect(result.current.children).toBeUndefined();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockListDirectory).toHaveBeenCalledWith(
        "/repo/src",
        "/repo",
        undefined,
      );
      expect(result.current.children).toHaveLength(3);
      expect(result.current.isResolved).toBe(true);
    });

    it("should prefetch children silently without showing spinner", async () => {
      const node = createMockNode("/repo/src", "src");

      const { result } = renderHook(() =>
        useDirectoryCache({
          node,
          rootPath: "/repo",
          isExpanded: false,
          prefetch: true,
        }),
      );

      // Should not show spinner for prefetch
      expect(result.current.isLoading).toBe(false);

      await waitFor(() => {
        expect(result.current.isResolved).toBe(true);
      });

      expect(mockListDirectory).toHaveBeenCalledWith(
        "/repo/src",
        "/repo",
        undefined,
      );
      expect(result.current.children).toHaveLength(3);
    });

    it("should not load when neither expanded nor prefetch", () => {
      const node = createMockNode("/repo/src", "src");

      const { result } = renderHook(() =>
        useDirectoryCache({
          node,
          rootPath: "/repo",
          isExpanded: false,
          prefetch: false,
        }),
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.children).toBeUndefined();
      expect(result.current.isResolved).toBe(false);
      expect(mockListDirectory).not.toHaveBeenCalled();
    });
  });

  describe("Caching behavior", () => {
    it("should not reload when re-expanded if already resolved", async () => {
      const node = createMockNode("/repo/src", "src");

      const { result, rerender } = renderHook(
        ({ isExpanded }) =>
          useDirectoryCache({
            node,
            rootPath: "/repo",
            isExpanded,
            prefetch: false,
          }),
        { initialProps: { isExpanded: true } },
      );

      await waitFor(() => {
        expect(result.current.isResolved).toBe(true);
      });

      expect(mockListDirectory).toHaveBeenCalledTimes(1);

      // Collapse and re-expand
      rerender({ isExpanded: false });
      rerender({ isExpanded: true });

      // Should still be resolved, no new API call
      expect(result.current.isResolved).toBe(true);
      expect(mockListDirectory).toHaveBeenCalledTimes(1);
      expect(result.current.children).toHaveLength(3);
    });
  });

  describe("Silent refresh on cache invalidation", () => {
    it("should silently refresh when directory is invalidated", async () => {
      const node = createMockNode("/repo/src", "src");
      const updatedChildren = [
        ...createMockChildren(),
        {
          name: "newFile.ts",
          path: "/repo/src/newFile.ts",
          relativePath: "src/newFile.ts",
          type: "file" as const,
        },
      ];

      const { result } = renderHook(() =>
        useDirectoryCache({
          node,
          rootPath: "/repo",
          isExpanded: true,
          prefetch: false,
        }),
      );

      await waitFor(() => {
        expect(result.current.isResolved).toBe(true);
      });

      expect(result.current.children).toHaveLength(3);

      // Update mock to return new children
      mockListDirectory.mockResolvedValueOnce(updatedChildren);

      // Invalidate directory (simulating file watcher update)
      // Component is mounted so it has listeners - will do silent refresh
      invalidateDirectory("/repo/src", "/repo");

      await waitFor(() => {
        expect(result.current.children).toHaveLength(4);
      });

      expect(mockListDirectory).toHaveBeenCalledTimes(2);
      expect(result.current.isResolved).toBe(true);
    });

    it("should not refresh unresolved directories on invalidation", async () => {
      const node = createMockNode("/repo/src", "src");

      renderHook(() =>
        useDirectoryCache({
          node,
          rootPath: "/repo",
          isExpanded: false,
          prefetch: false,
        }),
      );

      // Invalidate directory - component has no listeners, should do nothing
      invalidateDirectory("/repo/src", "/repo");

      // Should not have called API since directory was never resolved
      expect(mockListDirectory).not.toHaveBeenCalled();
    });
  });

  describe("Git status filtering", () => {
    it("should filter children based on git status when filtering is enabled", async () => {
      const node = createMockNode("/repo/src", "src");
      const gitStatus: GitStatusMap = new Map([
        [
          "src/file1.ts",
          { status: "modified", staged: false, relativePath: "src/file1.ts" },
        ],
      ]);

      const { result } = renderHook(() =>
        useDirectoryCache({
          node,
          rootPath: "/repo",
          isExpanded: true,
          prefetch: false,
          isFiltering: true,
          gitStatus,
        }),
      );

      await waitFor(() => {
        expect(result.current.isResolved).toBe(true);
      });

      // Should only show file1.ts (has git status)
      expect(result.current.children).toHaveLength(1);
      expect(result.current.children?.[0]?.name).toBe("file1.ts");
    });

    it("should show directories that contain changed files", async () => {
      const node = createMockNode("/repo/src", "src");
      const gitStatus: GitStatusMap = new Map([
        [
          "src/components/Button.tsx",
          {
            status: "modified",
            staged: false,
            relativePath: "src/components/Button.tsx",
          },
        ],
      ]);

      const { result } = renderHook(() =>
        useDirectoryCache({
          node,
          rootPath: "/repo",
          isExpanded: true,
          prefetch: false,
          isFiltering: true,
          gitStatus,
        }),
      );

      await waitFor(() => {
        expect(result.current.isResolved).toBe(true);
      });

      // Should show components directory (contains changed file)
      expect(result.current.children).toHaveLength(1);
      expect(result.current.children?.[0]?.name).toBe("components");
    });

    it("should not filter when filtering is disabled", async () => {
      const node = createMockNode("/repo/src", "src");
      const gitStatus: GitStatusMap = new Map([
        [
          "src/file1.ts",
          { status: "modified", staged: false, relativePath: "src/file1.ts" },
        ],
      ]);

      const { result } = renderHook(() =>
        useDirectoryCache({
          node,
          rootPath: "/repo",
          isExpanded: true,
          prefetch: false,
          isFiltering: false,
          gitStatus,
        }),
      );

      await waitFor(() => {
        expect(result.current.isResolved).toBe(true);
      });

      // Should show all children
      expect(result.current.children).toHaveLength(3);
    });
  });

  describe("Path change invalidation", () => {
    it("should clear cache when node path changes", async () => {
      const node1 = createMockNode("/repo/src", "src");

      const { result, rerender } = renderHook(
        ({ node }) =>
          useDirectoryCache({
            node,
            rootPath: "/repo",
            isExpanded: true,
            prefetch: false,
          }),
        { initialProps: { node: node1 } },
      );

      await waitFor(() => {
        expect(result.current.isResolved).toBe(true);
      });

      expect(result.current.children).toHaveLength(3);

      // Change node path
      const node2 = createMockNode("/repo/tests", "tests");
      rerender({ node: node2 });

      // Cache should be cleared
      expect(result.current.isResolved).toBe(false);
      expect(result.current.children).toBeUndefined();
    });
  });

  describe("Error handling", () => {
    it("should mark as resolved on error to avoid retry loops", async () => {
      const node = createMockNode("/repo/src", "src");
      mockListDirectory.mockRejectedValueOnce(new Error("Access denied"));

      const { result } = renderHook(() =>
        useDirectoryCache({
          node,
          rootPath: "/repo",
          isExpanded: true,
          prefetch: false,
        }),
      );

      await waitFor(() => {
        expect(result.current.isResolved).toBe(true);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.children).toEqual([]);
    });
  });

  describe("Manual load function", () => {
    it("should allow manual loading via loadChildren function", async () => {
      const node = createMockNode("/repo/src", "src");

      const { result } = renderHook(() =>
        useDirectoryCache({
          node,
          rootPath: "/repo",
          isExpanded: false,
          prefetch: false,
        }),
      );

      expect(result.current.isResolved).toBe(false);

      // Manually trigger load
      await result.current.loadChildren(false);

      // Wait for state to update
      await waitFor(() => {
        expect(result.current.isResolved).toBe(true);
      });

      expect(mockListDirectory).toHaveBeenCalledWith(
        "/repo/src",
        "/repo",
        undefined,
      );
      expect(result.current.children).toHaveLength(3);
    });

    it("should show spinner when loadChildren called with showSpinner=true", async () => {
      const node = createMockNode("/repo/src", "src");

      // Make the mock resolve slower to observe loading state
      mockListDirectory.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(createMockChildren()), 50);
          }),
      );

      const { result } = renderHook(() =>
        useDirectoryCache({
          node,
          rootPath: "/repo",
          isExpanded: false,
          prefetch: false,
        }),
      );

      // Trigger load with spinner
      const loadPromise = result.current.loadChildren(true);

      // Wait for loading state to be set
      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      await loadPromise;

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.isResolved).toBe(true);
      });
    });
  });
});
