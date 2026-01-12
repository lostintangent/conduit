/**
 * Tests for the useCommitGraph hook.
 *
 * These tests verify the state management, data fetching,
 * expansion behavior, and pagination of the commit graph.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// =============================================================================
// Mocks
// =============================================================================

// Mock the swimlanes computation
vi.mock(
  "../../../../../../src/renderer/components/panes/editor-v2/components/CommitGraph/graph/swimlanes",
  () => ({
    computeSwimlanes: vi.fn((commits, options) => {
      // Simple mock that returns nodes with basic swimlane data
      return commits.map((commit: any, index: number) => ({
        commit,
        laneIndex: 0,
        inputSwimlanes: [],
        outputSwimlanes: [],
        isMerge: false,
        isHead: options?.headCommitId === commit.id,
        segmentType: null,
      }));
    }),
  }),
);

// Create mock Git API
function createMockGitAPI() {
  return {
    getCommitHistory: vi.fn(),
    getCommitFiles: vi.fn(),
    getTrackedBranches: vi.fn().mockResolvedValue({
      current: null,
      upstream: null,
      base: null,
    }),
  };
}

// Import hook after mocks are set up
// Hook was moved from CommitGraph/hooks to editor-v2/hooks
import { useCommitGraph } from "../../../../../../src/renderer/components/panes/editor-v2/hooks/useCommitGraph";
import type { GitV2API } from "../../../../../../src/renderer/api/GitV2API";

// =============================================================================
// Test Data
// =============================================================================

function createMockCommit(id: string, overrides: Partial<any> = {}) {
  return {
    id,
    shortId: id.slice(0, 7),
    subject: `Commit ${id.slice(0, 7)}`,
    message: `Commit ${id.slice(0, 7)}\n\nDetailed message`,
    author: "Test Author",
    authorEmail: "test@example.com",
    timestamp: Math.floor(Date.now() / 1000) - 3600,
    parentIds: [],
    ...overrides,
  };
}

function createMockFile(path: string, status = "modified") {
  return {
    path,
    status,
    additions: 10,
    deletions: 5,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("useCommitGraph", () => {
  let mockGit: ReturnType<typeof createMockGitAPI>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGit = createMockGitAPI();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Initial State
  // ===========================================================================

  describe("initial state", () => {
    it("should start with empty nodes", () => {
      mockGit.getCommitHistory.mockResolvedValue({
        commits: [],
        hasMore: false,
      });

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      expect(result.current.nodes).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("should have empty expanded set initially", () => {
      mockGit.getCommitHistory.mockResolvedValue({
        commits: [],
        hasMore: false,
      });

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      expect(result.current.expandedCommitIds.size).toBe(0);
    });

    it("should have empty loading files set initially", () => {
      mockGit.getCommitHistory.mockResolvedValue({
        commits: [],
        hasMore: false,
      });

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      expect(result.current.loadingFilesIds.size).toBe(0);
    });
  });

  // ===========================================================================
  // Load on Mount
  // ===========================================================================

  describe("load on mount", () => {
    it("should load commits automatically when loadOnMount is true", async () => {
      const commits = [createMockCommit("abc123")];
      mockGit.getCommitHistory.mockResolvedValue({ commits, hasMore: false });

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: true }),
      );

      // Should be loading initially
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.nodes.length).toBe(1);
      expect(mockGit.getCommitHistory).toHaveBeenCalledWith({
        limit: 50,
        skip: 0,
      });
    });

    it("should not load commits when loadOnMount is false", () => {
      mockGit.getCommitHistory.mockResolvedValue({
        commits: [],
        hasMore: false,
      });

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      expect(result.current.isLoading).toBe(false);
      expect(mockGit.getCommitHistory).not.toHaveBeenCalled();
    });

    it("should use custom pageSize", async () => {
      mockGit.getCommitHistory.mockResolvedValue({
        commits: [],
        hasMore: false,
      });

      renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, {
          loadOnMount: true,
          pageSize: 25,
        }),
      );

      await waitFor(() => {
        expect(mockGit.getCommitHistory).toHaveBeenCalledWith({
          limit: 25,
          skip: 0,
        });
      });
    });
  });

  // ===========================================================================
  // Refresh
  // ===========================================================================

  describe("refresh", () => {
    it("should fetch commits from scratch", async () => {
      mockGit.getCommitHistory.mockResolvedValue({
        commits: [],
        hasMore: false,
      });

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockGit.getCommitHistory).toHaveBeenCalledWith({
        limit: 50,
        skip: 0,
      });
    });

    it("should set isLoading while fetching", async () => {
      let resolvePromise: (value: any) => void;
      mockGit.getCommitHistory.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
      );

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      // Start refresh without waiting
      act(() => {
        result.current.refresh();
      });

      expect(result.current.isLoading).toBe(true);

      // Resolve the promise
      await act(async () => {
        resolvePromise!({ commits: [], hasMore: false });
      });

      expect(result.current.isLoading).toBe(false);
    });

    it("should update nodes after successful fetch", async () => {
      const commits = [createMockCommit("abc123"), createMockCommit("def456")];
      mockGit.getCommitHistory.mockResolvedValue({ commits, hasMore: false });

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.nodes.length).toBe(2);
      expect(result.current.nodes[0].commit.id).toBe("abc123");
      expect(result.current.nodes[1].commit.id).toBe("def456");
    });

    it("should clear previous error on refresh", async () => {
      // First call fails
      mockGit.getCommitHistory.mockRejectedValueOnce(
        new Error("Network error"),
      );

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        try {
          await result.current.refresh();
        } catch {
          // Expected
        }
      });

      expect(result.current.error).toBe("Network error");

      // Second call succeeds
      mockGit.getCommitHistory.mockResolvedValueOnce({
        commits: [],
        hasMore: false,
      });

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.error).toBeNull();
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe("error handling", () => {
    it("should set error on fetch failure", async () => {
      mockGit.getCommitHistory.mockRejectedValue(new Error("Failed to fetch"));

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        try {
          await result.current.refresh();
        } catch {
          // Expected
        }
      });

      expect(result.current.error).toBe("Failed to fetch");
    });

    it("should handle 'not a git repository' error", async () => {
      mockGit.getCommitHistory.mockRejectedValue(
        new Error("fatal: not a git repository"),
      );

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        try {
          await result.current.refresh();
        } catch {
          // Expected
        }
      });

      expect(result.current.error).toBe("Not a git repository");
    });

    it("should handle 'bad revision' error", async () => {
      mockGit.getCommitHistory.mockRejectedValue(
        new Error("fatal: bad revision 'nonexistent'"),
      );

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        try {
          await result.current.refresh();
        } catch {
          // Expected
        }
      });

      expect(result.current.error).toBe("Invalid branch or commit reference");
    });

    it("should clear error with clearError action", async () => {
      mockGit.getCommitHistory.mockRejectedValue(new Error("Some error"));

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        try {
          await result.current.refresh();
        } catch {
          // Expected
        }
      });

      expect(result.current.error).toBe("Some error");

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  // ===========================================================================
  // Load More (Pagination)
  // ===========================================================================

  describe("loadMore", () => {
    it("should load more commits with correct skip", async () => {
      const firstPage = [createMockCommit("abc123")];
      const secondPage = [createMockCommit("def456")];

      mockGit.getCommitHistory
        .mockResolvedValueOnce({ commits: firstPage, hasMore: true })
        .mockResolvedValueOnce({ commits: secondPage, hasMore: false });

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      // Load first page
      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.nodes.length).toBe(1);
      expect(result.current.hasMore).toBe(true);

      // Load more
      await act(async () => {
        await result.current.loadMore();
      });

      expect(result.current.nodes.length).toBe(2);
      expect(result.current.hasMore).toBe(false);
      expect(mockGit.getCommitHistory).toHaveBeenLastCalledWith({
        limit: 50,
        skip: 1,
      });
    });

    it("should set isLoadingMore while fetching more", async () => {
      let resolveSecond: (value: any) => void;

      mockGit.getCommitHistory
        .mockResolvedValueOnce({
          commits: [createMockCommit("abc123")],
          hasMore: true,
        })
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
        );

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      // Start loadMore without waiting
      act(() => {
        result.current.loadMore();
      });

      expect(result.current.isLoadingMore).toBe(true);
      expect(result.current.isLoading).toBe(false);

      await act(async () => {
        resolveSecond!({ commits: [], hasMore: false });
      });

      expect(result.current.isLoadingMore).toBe(false);
    });

    it("should not load more when hasMore is false", async () => {
      mockGit.getCommitHistory.mockResolvedValue({
        commits: [createMockCommit("abc123")],
        hasMore: false,
      });

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.loadMore();
      });

      // Should only have called once (for refresh)
      expect(mockGit.getCommitHistory).toHaveBeenCalledTimes(1);
    });

    it("should not load more when already loading more", async () => {
      let resolveSecond: (value: any) => void;

      mockGit.getCommitHistory
        .mockResolvedValueOnce({
          commits: [createMockCommit("abc123")],
          hasMore: true,
        })
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
        );

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      // Start first loadMore
      act(() => {
        result.current.loadMore();
      });

      // Try to start second loadMore
      act(() => {
        result.current.loadMore();
      });

      // Should only have called getCommitHistory twice (refresh + one loadMore)
      expect(mockGit.getCommitHistory).toHaveBeenCalledTimes(2);

      await act(async () => {
        resolveSecond!({ commits: [], hasMore: false });
      });
    });
  });

  // ===========================================================================
  // Expand/Collapse
  // ===========================================================================

  describe("toggleExpand", () => {
    it("should expand a commit", async () => {
      mockGit.getCommitHistory.mockResolvedValue({
        commits: [createMockCommit("abc123")],
        hasMore: false,
      });
      mockGit.getCommitFiles.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.toggleExpand("abc123");
      });

      expect(result.current.expandedCommitIds.has("abc123")).toBe(true);
    });

    it("should collapse an expanded commit", async () => {
      mockGit.getCommitHistory.mockResolvedValue({
        commits: [createMockCommit("abc123")],
        hasMore: false,
      });
      mockGit.getCommitFiles.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      // Expand
      await act(async () => {
        await result.current.toggleExpand("abc123");
      });

      expect(result.current.expandedCommitIds.has("abc123")).toBe(true);

      // Collapse
      await act(async () => {
        await result.current.toggleExpand("abc123");
      });

      expect(result.current.expandedCommitIds.has("abc123")).toBe(false);
    });

    it("should load files when expanding", async () => {
      const files = [
        createMockFile("src/index.ts"),
        createMockFile("README.md"),
      ];

      mockGit.getCommitHistory.mockResolvedValue({
        commits: [createMockCommit("abc123")],
        hasMore: false,
      });
      mockGit.getCommitFiles.mockResolvedValue(files);

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.toggleExpand("abc123");
      });

      expect(mockGit.getCommitFiles).toHaveBeenCalledWith("abc123");
      expect(result.current.nodes[0].files?.length).toBe(2);
    });

    it("should not reload files when re-expanding", async () => {
      mockGit.getCommitHistory.mockResolvedValue({
        commits: [createMockCommit("abc123")],
        hasMore: false,
      });
      mockGit.getCommitFiles.mockResolvedValue([
        createMockFile("src/index.ts"),
      ]);

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      // Expand
      await act(async () => {
        await result.current.toggleExpand("abc123");
      });

      // Collapse
      await act(async () => {
        await result.current.toggleExpand("abc123");
      });

      // Re-expand
      await act(async () => {
        await result.current.toggleExpand("abc123");
      });

      // Should only have loaded files once
      expect(mockGit.getCommitFiles).toHaveBeenCalledTimes(1);
    });

    it("should set isLoadingFiles while loading files", async () => {
      let resolveFiles: (value: any) => void;

      mockGit.getCommitHistory.mockResolvedValue({
        commits: [createMockCommit("abc123")],
        hasMore: false,
      });
      mockGit.getCommitFiles.mockReturnValue(
        new Promise((resolve) => {
          resolveFiles = resolve;
        }),
      );

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      // Start expanding without waiting
      act(() => {
        result.current.toggleExpand("abc123");
      });

      expect(result.current.loadingFilesIds.has("abc123")).toBe(true);
      expect(result.current.nodes[0].isLoadingFiles).toBe(true);

      await act(async () => {
        resolveFiles!([]);
      });

      expect(result.current.loadingFilesIds.has("abc123")).toBe(false);
      expect(result.current.nodes[0].isLoadingFiles).toBe(false);
    });

    it("should handle file loading errors gracefully", async () => {
      mockGit.getCommitHistory.mockResolvedValue({
        commits: [createMockCommit("abc123")],
        hasMore: false,
      });
      mockGit.getCommitFiles.mockRejectedValue(new Error("File load failed"));

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      await act(async () => {
        await result.current.toggleExpand("abc123");
      });

      // Should still be expanded even if files failed to load
      expect(result.current.expandedCommitIds.has("abc123")).toBe(true);
      // Should not be loading anymore
      expect(result.current.loadingFilesIds.has("abc123")).toBe(false);
      // Should have logged error
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  // ===========================================================================
  // Collapse All
  // ===========================================================================

  describe("collapseAll", () => {
    it("should collapse all expanded commits", async () => {
      mockGit.getCommitHistory.mockResolvedValue({
        commits: [
          createMockCommit("abc123"),
          createMockCommit("def456"),
          createMockCommit("ghi789"),
        ],
        hasMore: false,
      });
      mockGit.getCommitFiles.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      // Expand multiple commits
      await act(async () => {
        await result.current.toggleExpand("abc123");
        await result.current.toggleExpand("def456");
      });

      expect(result.current.expandedCommitIds.size).toBe(2);

      // Collapse all
      act(() => {
        result.current.collapseAll();
      });

      expect(result.current.expandedCommitIds.size).toBe(0);
    });
  });

  // ===========================================================================
  // HEAD Commit
  // ===========================================================================

  describe("head commit", () => {
    it("should mark HEAD commit in nodes", async () => {
      mockGit.getCommitHistory.mockResolvedValue({
        commits: [createMockCommit("abc123"), createMockCommit("def456")],
        hasMore: false,
      });

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, {
          loadOnMount: false,
          headCommitId: "abc123",
        }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.nodes[0].isHead).toBe(true);
      expect(result.current.nodes[1].isHead).toBe(false);
    });
  });

  // ===========================================================================
  // Expansion State Preservation
  // ===========================================================================

  describe("expansion state preservation", () => {
    it("should preserve expanded commits after loadMore", async () => {
      mockGit.getCommitHistory
        .mockResolvedValueOnce({
          commits: [createMockCommit("abc123")],
          hasMore: true,
        })
        .mockResolvedValueOnce({
          commits: [createMockCommit("def456")],
          hasMore: false,
        });
      mockGit.getCommitFiles.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      // Expand a commit
      await act(async () => {
        await result.current.toggleExpand("abc123");
      });

      expect(result.current.expandedCommitIds.has("abc123")).toBe(true);

      // Load more
      await act(async () => {
        await result.current.loadMore();
      });

      // Expansion should be preserved
      expect(result.current.expandedCommitIds.has("abc123")).toBe(true);
      expect(result.current.nodes.length).toBe(2);
    });

    it("should preserve files cache after loadMore", async () => {
      const files = [createMockFile("src/index.ts")];

      mockGit.getCommitHistory
        .mockResolvedValueOnce({
          commits: [createMockCommit("abc123")],
          hasMore: true,
        })
        .mockResolvedValueOnce({
          commits: [createMockCommit("def456")],
          hasMore: false,
        });
      mockGit.getCommitFiles.mockResolvedValue(files);

      const { result } = renderHook(() =>
        useCommitGraph(mockGit as unknown as GitV2API, { loadOnMount: false }),
      );

      await act(async () => {
        await result.current.refresh();
      });

      // Expand and load files
      await act(async () => {
        await result.current.toggleExpand("abc123");
      });

      expect(result.current.nodes[0].files?.length).toBe(1);

      // Load more
      await act(async () => {
        await result.current.loadMore();
      });

      // Files should still be attached
      expect(result.current.nodes[0].files?.length).toBe(1);
    });
  });
});
