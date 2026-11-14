import { waitFor } from "@testing-library/react";
import { mockGitReads } from "../../../../tests/renderer/git";
import { renderHook } from "../../../../tests/renderer/queryRender";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockGitInstances = new Map<string, MockGitAPI>();
const mockFsInstances = new Map<string, MockFsAPI>();

interface MockGitAPI {
  cwd: string;
  whenReady: ReturnType<typeof vi.fn>;
}

interface MockFsAPI {
  cwd: string;
  onAnyFileContentChanged: ReturnType<typeof vi.fn>;
}

function createMockGitAPI(cwd: string): MockGitAPI {
  return {
    cwd,
    whenReady: vi.fn().mockResolvedValue(undefined),
  };
}

// Every cwd is the root of a repository with these changes, unless a test
// says otherwise
let reads: ReturnType<typeof mockGitReads>;

function mockRepos() {
  reads = mockGitReads();
  reads.findRoot.mockImplementation(async (cwd: string) => cwd);
  reads.getUncommittedDiffStats.mockResolvedValue({
    added: 10,
    removed: 5,
    files: 2,
  });
  reads.getStatus.mockResolvedValue({
    files: new Map([
      [
        "src/file1.ts",
        { status: "modified", staged: false, path: "src/file1.ts" },
      ],
      ["src/file2.ts", { status: "added", staged: true, path: "src/file2.ts" }],
    ]),
  });
}

function createMockFsAPI(cwd: string): MockFsAPI {
  return {
    cwd,
    onAnyFileContentChanged: vi.fn().mockReturnValue(vi.fn()),
  };
}

// Mock useGitV2
vi.mock("./useGitV2", () => ({
  useGitV2: vi.fn((cwd: string) => {
    let api = mockGitInstances.get(cwd);
    if (!api) {
      api = createMockGitAPI(cwd);
      mockGitInstances.set(cwd, api);
    }
    return api;
  }),
}));

// Mock useFileSystemV2
vi.mock("@features/files/components/useFileSystemV2", () => ({
  useFileSystemV2: vi.fn((cwd: string) => {
    let api = mockFsInstances.get(cwd);
    if (!api) {
      api = createMockFsAPI(cwd);
      mockFsInstances.set(cwd, api);
    }
    return api;
  }),
}));

// ============================================================================
// Import after mocks
// ============================================================================

import { createQueryClient } from "@/query";
import { useUncommittedDiffStats } from "./useUncommittedDiffStats";

// ============================================================================
// Tests
// ============================================================================

describe("useUncommittedDiffStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGitInstances.clear();
    mockFsInstances.clear();
    mockRepos();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Basic Functionality
  // ===========================================================================

  describe("basic functionality", () => {
    it("should return stats, gitStatus, and isGitRepo", async () => {
      const { result } = renderHook(() =>
        useUncommittedDiffStats("/test/project"),
      );

      await waitFor(() => {
        expect(result.current.stats).not.toBeNull();
      });

      expect(result.current.stats).toEqual({
        added: 10,
        removed: 5,
        files: 2,
      });
      expect(result.current.isGitRepo).toBe(true);
      expect(result.current.gitStatus).not.toBeNull();
      expect(result.current.gitStatus?.size).toBe(2);
    });

    it("should return null stats and gitStatus initially", () => {
      // Git reads that never resolve
      reads.getUncommittedDiffStats.mockImplementation(
        () => new Promise(() => {}),
      );

      const { result } = renderHook(() =>
        useUncommittedDiffStats("/slow/project"),
      );

      // Initially null before async resolves
      expect(result.current.stats).toBeNull();
      expect(result.current.gitStatus).toBeNull();
      expect(result.current.isGitRepo).toBeNull();
    });
  });

  // ===========================================================================
  // Non-Git Repo Handling
  // ===========================================================================

  describe("non-git repo handling", () => {
    it("should set isGitRepo to false when not a git repo", async () => {
      reads.findRoot.mockResolvedValue(null);

      const { result } = renderHook(() =>
        useUncommittedDiffStats("/not/a/repo"),
      );

      await waitFor(() => {
        expect(result.current.isGitRepo).toBe(false);
      });

      expect(result.current.stats).toBeNull();
      expect(result.current.gitStatus).toBeNull();
    });

    it("should not fetch stats or status when not a git repo", async () => {
      reads.findRoot.mockResolvedValue(null);

      renderHook(() => useUncommittedDiffStats("/not/a/repo"));

      await waitFor(() => {
        expect(reads.findRoot).toHaveBeenCalledWith("/not/a/repo");
      });

      // Neither should be called for non-git repos
      expect(reads.getUncommittedDiffStats).not.toHaveBeenCalled();
      expect(reads.getStatus).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe("error handling", () => {
    it("should handle errors gracefully", async () => {
      reads.getUncommittedDiffStats.mockRejectedValue(new Error("Git error"));

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const { result } = renderHook(() =>
        useUncommittedDiffStats("/error/project"),
      );

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      expect(result.current.stats).toBeNull();

      consoleSpy.mockRestore();
    });
  });

  // ===========================================================================
  // CWD Changes
  // ===========================================================================

  describe("cwd changes", () => {
    it("should reset stats when cwd changes", async () => {
      const { result, rerender } = renderHook(
        ({ cwd }) => useUncommittedDiffStats(cwd),
        { initialProps: { cwd: "/project/a" } },
      );

      await waitFor(() => {
        expect(result.current.stats).not.toBeNull();
      });

      // Change cwd
      rerender({ cwd: "/project/b" });

      // Stats should update (may briefly be null during transition)
      await waitFor(() => {
        expect(result.current.stats).not.toBeNull();
      });
    });

    it("should use different git instances for different cwds", async () => {
      const statsByCwd = new Map([
        ["/project/a", { added: 100, removed: 50, files: 10 }],
        ["/project/b", { added: 200, removed: 100, files: 20 }],
      ]);
      reads.getUncommittedDiffStats.mockImplementation(async (cwd: string) =>
        statsByCwd.get(cwd),
      );

      const { result, rerender } = renderHook(
        ({ cwd }) => useUncommittedDiffStats(cwd),
        { initialProps: { cwd: "/project/a" } },
      );

      await waitFor(() => {
        expect(result.current.stats?.added).toBe(100);
      });

      rerender({ cwd: "/project/b" });

      await waitFor(() => {
        expect(result.current.stats?.added).toBe(200);
      });
    });
  });

  // ===========================================================================
  // Shared cache
  // ===========================================================================

  describe("shared cache", () => {
    it("re-reads diff stats and status once file edits settle", async () => {
      const { result } = renderHook(() =>
        useUncommittedDiffStats("/test/project"),
      );
      await waitFor(() => expect(result.current.stats?.added).toBe(10));

      const fs = mockFsInstances.get("/test/project")!;
      reads.getUncommittedDiffStats.mockResolvedValue({
        added: 11,
        removed: 5,
        files: 2,
      });
      reads.getStatus.mockResolvedValue({
        files: new Map([["new.ts", { path: "new.ts", status: "modified" }]]),
      });
      const onContentChanged = fs.onAnyFileContentChanged.mock.calls[0][0];
      onContentChanged();
      onContentChanged();

      await waitFor(() => {
        expect(result.current.stats?.added).toBe(11);
        expect(result.current.gitStatus?.has("new.ts")).toBe(true);
      });
      expect(reads.getUncommittedDiffStats.mock.calls).toEqual([
        ["/test/project"],
        ["/test/project"],
      ]);
      expect(reads.getStatus.mock.calls).toEqual([
        ["/test/project"],
        ["/test/project"],
      ]);
    });

    it("shares one read between readers of the same cwd", async () => {
      const queryClient = createQueryClient();
      const first = renderHook(() => useUncommittedDiffStats("/test/project"), {
        queryClient,
      });
      const second = renderHook(
        () => useUncommittedDiffStats("/test/project"),
        { queryClient },
      );

      await waitFor(() => {
        expect(first.result.current.stats?.added).toBe(10);
        expect(second.result.current.stats?.added).toBe(10);
      });
      expect(reads.getUncommittedDiffStats.mock.calls).toEqual([
        ["/test/project"],
      ]);
      expect(reads.getStatus.mock.calls).toEqual([["/test/project"]]);
    });

    it("shows the last stats right away when remounted", async () => {
      const queryClient = createQueryClient();
      const first = renderHook(() => useUncommittedDiffStats("/test/project"), {
        queryClient,
      });
      await waitFor(() => expect(first.result.current.stats).not.toBeNull());
      first.unmount();

      const second = renderHook(
        () => useUncommittedDiffStats("/test/project"),
        { queryClient },
      );
      expect(second.result.current.stats?.added).toBe(10);
      expect(second.result.current.gitStatus?.size).toBe(2);
    });
  });
});
