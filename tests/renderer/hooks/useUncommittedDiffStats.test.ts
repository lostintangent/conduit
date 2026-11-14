/**
 * @vitest-environment jsdom
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const mockGitInstances = new Map<string, MockGitAPI>();
const mockFsInstances = new Map<string, MockFsAPI>();

interface MockGitAPI {
  cwd: string;
  findRoot: ReturnType<typeof vi.fn>;
  getUncommittedDiffStats: ReturnType<typeof vi.fn>;
  getStatus: ReturnType<typeof vi.fn>;
  whenReady: ReturnType<typeof vi.fn>;
  onStatusChanged: ReturnType<typeof vi.fn>;
}

interface MockFsAPI {
  cwd: string;
  onAnyFileContentChanged: ReturnType<typeof vi.fn>;
}

function createMockGitAPI(cwd: string): MockGitAPI {
  return {
    cwd,
    findRoot: vi.fn().mockResolvedValue(cwd),
    getUncommittedDiffStats: vi.fn().mockResolvedValue({
      added: 10,
      removed: 5,
      files: 2,
    }),
    getStatus: vi.fn().mockResolvedValue({
      files: new Map([
        [
          "src/file1.ts",
          { status: "modified", staged: false, path: "src/file1.ts" },
        ],
        [
          "src/file2.ts",
          { status: "added", staged: true, path: "src/file2.ts" },
        ],
      ]),
    }),
    whenReady: vi.fn().mockResolvedValue(undefined),
    onStatusChanged: vi.fn().mockReturnValue(vi.fn()),
  };
}

function createMockFsAPI(cwd: string): MockFsAPI {
  return {
    cwd,
    onAnyFileContentChanged: vi.fn().mockReturnValue(vi.fn()),
  };
}

// Mock useGitV2
vi.mock("../../../src/renderer/hooks/useGitV2", () => ({
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
vi.mock("../../../src/renderer/hooks/useFileSystemV2", () => ({
  useFileSystemV2: vi.fn((cwd: string) => {
    let api = mockFsInstances.get(cwd);
    if (!api) {
      api = createMockFsAPI(cwd);
      mockFsInstances.set(cwd, api);
    }
    return api;
  }),
}));

// Mock useGitDiffSubscription to just call fetchStats once
vi.mock("../../../src/renderer/hooks/useGitDiffSubscription", () => ({
  useGitDiffSubscription: vi.fn(
    (_git: unknown, _fs: unknown, fetchStats: () => Promise<void>) => {
      // Simulate initial fetch
      fetchStats();
    },
  ),
}));

// ============================================================================
// Import after mocks
// ============================================================================

import { useUncommittedDiffStats } from "../../../src/renderer/hooks/useUncommittedDiffStats";

// ============================================================================
// Tests
// ============================================================================

describe("useUncommittedDiffStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGitInstances.clear();
    mockFsInstances.clear();
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
      // Create a git API that never resolves
      const slowGitAPI = createMockGitAPI("/slow/project");
      slowGitAPI.getUncommittedDiffStats.mockImplementation(
        () => new Promise(() => {}),
      );
      mockGitInstances.set("/slow/project", slowGitAPI);

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
      const nonGitAPI = createMockGitAPI("/not/a/repo");
      nonGitAPI.findRoot.mockResolvedValue(null);
      mockGitInstances.set("/not/a/repo", nonGitAPI);

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
      const nonGitAPI = createMockGitAPI("/not/a/repo");
      nonGitAPI.findRoot.mockResolvedValue(null);
      mockGitInstances.set("/not/a/repo", nonGitAPI);

      renderHook(() => useUncommittedDiffStats("/not/a/repo"));

      await waitFor(() => {
        expect(nonGitAPI.findRoot).toHaveBeenCalled();
      });

      // Neither should be called for non-git repos
      expect(nonGitAPI.getUncommittedDiffStats).not.toHaveBeenCalled();
      expect(nonGitAPI.getStatus).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe("error handling", () => {
    it("should handle errors gracefully", async () => {
      const errorGitAPI = createMockGitAPI("/error/project");
      errorGitAPI.getUncommittedDiffStats.mockRejectedValue(
        new Error("Git error"),
      );
      mockGitInstances.set("/error/project", errorGitAPI);

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
      const gitA = createMockGitAPI("/project/a");
      gitA.getUncommittedDiffStats.mockResolvedValue({
        added: 100,
        removed: 50,
        files: 10,
      });
      mockGitInstances.set("/project/a", gitA);

      const gitB = createMockGitAPI("/project/b");
      gitB.getUncommittedDiffStats.mockResolvedValue({
        added: 200,
        removed: 100,
        files: 20,
      });
      mockGitInstances.set("/project/b", gitB);

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
  // Integration with useGitDiffSubscription
  // ===========================================================================

  describe("integration with useGitDiffSubscription", () => {
    it("should pass correct dependencies to useGitDiffSubscription", async () => {
      const { useGitDiffSubscription } =
        await import("../../../src/renderer/hooks/useGitDiffSubscription");

      renderHook(() => useUncommittedDiffStats("/test/project"));

      expect(useGitDiffSubscription).toHaveBeenCalled();

      // The mock was called with git, fs, and fetchStats
      const [git, fs, fetchStats] = (
        useGitDiffSubscription as ReturnType<typeof vi.fn>
      ).mock.calls[0];
      expect(git).toBeDefined();
      expect(fs).toBeDefined();
      expect(typeof fetchStats).toBe("function");
    });
  });
});
