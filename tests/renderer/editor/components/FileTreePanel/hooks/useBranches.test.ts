/**
 * Tests for useBranches hook.
 *
 * Tests the shared hook for fetching and managing branch data.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderHook } from "../../../../queryRender";
import {
  useBranches,
  filterBranchesByQuery,
} from "@/components/panes/editor/components/FileTreePanel/hooks/useBranches";
import type { GitV2API } from "@features/git/client/GitV2API";
import type { GitBranch } from "@features/git/client/GitV2API";

// ============================================================================
// Test Data
// ============================================================================

const mockBranches: GitBranch[] = [
  {
    name: "main",
    isCurrent: true,
    isRemote: false,
    commit: "abc123",
    lastCommitDate: new Date("2025-01-15"),
  },
  {
    name: "develop",
    isCurrent: false,
    isRemote: false,
    commit: "def456",
    lastCommitDate: new Date("2025-01-16"),
  },
  {
    name: "feature/old",
    isCurrent: false,
    isRemote: false,
    commit: "ghi789",
    lastCommitDate: new Date("2025-01-10"),
  },
  {
    name: "origin/main",
    isCurrent: false,
    isRemote: true,
    commit: "abc123",
    lastCommitDate: new Date("2025-01-15"),
  },
];

// ============================================================================
// Mock Git API
// ============================================================================

function createMockGitAPI(overrides: Partial<GitV2API> = {}): GitV2API {
  return {
    whenReady: vi.fn().mockResolvedValue(undefined),
    getBranches: vi.fn().mockResolvedValue(mockBranches),
    ...overrides,
  } as unknown as GitV2API;
}

// ============================================================================
// Tests
// ============================================================================

describe("useBranches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetching", () => {
    it("should not fetch when disabled", async () => {
      const mockGit = createMockGitAPI();

      const { result } = renderHook(() =>
        useBranches(mockGit, { enabled: false }),
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.branches).toEqual([]);
      expect(mockGit.getBranches).not.toHaveBeenCalled();
    });

    it("should fetch branches when enabled", async () => {
      const mockGit = createMockGitAPI();

      const { result } = renderHook(() =>
        useBranches(mockGit, { enabled: true }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGit.whenReady).toHaveBeenCalled();
      expect(mockGit.getBranches).toHaveBeenCalled();
      expect(result.current.branches.length).toBeGreaterThan(0);
    });

    it("should handle null git API", () => {
      const { result } = renderHook(() => useBranches(null, { enabled: true }));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.branches).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it("should handle errors", async () => {
      const mockGit = createMockGitAPI({
        getBranches: vi.fn().mockRejectedValue(new Error("Network error")),
      });

      const { result } = renderHook(() =>
        useBranches(mockGit, { enabled: true }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe("Failed to load branches");
    });
  });

  describe("filtering", () => {
    it("should filter out remote branches by default", async () => {
      const mockGit = createMockGitAPI();

      const { result } = renderHook(() =>
        useBranches(mockGit, { enabled: true, includeRemote: false }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const branchNames = result.current.branches.map((b) => b.name);
      expect(branchNames).not.toContain("origin/main");
      expect(branchNames).toContain("main");
      expect(branchNames).toContain("develop");
    });

    it("should include remote branches when requested", async () => {
      const mockGit = createMockGitAPI();

      const { result } = renderHook(() =>
        useBranches(mockGit, { enabled: true, includeRemote: true }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const branchNames = result.current.branches.map((b) => b.name);
      expect(branchNames).toContain("origin/main");
    });
  });

  describe("sorting", () => {
    it("should sort by last commit date (most recent first)", async () => {
      const mockGit = createMockGitAPI();

      const { result } = renderHook(() =>
        useBranches(mockGit, {
          enabled: true,
          currentBranchFirst: false,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const localBranches = result.current.branches.filter((b) => !b.isRemote);
      // develop (Jan 16) should come before main (Jan 15) which should come before feature/old (Jan 10)
      expect(localBranches[0].name).toBe("develop");
      expect(localBranches[1].name).toBe("main");
      expect(localBranches[2].name).toBe("feature/old");
    });

    it("should put current branch first when requested", async () => {
      const mockGit = createMockGitAPI();

      const { result } = renderHook(() =>
        useBranches(mockGit, {
          enabled: true,
          currentBranchFirst: true,
          currentBranch: "main",
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const localBranches = result.current.branches.filter((b) => !b.isRemote);
      expect(localBranches[0].name).toBe("main");
    });
  });
});

describe("filterBranchesByQuery", () => {
  it("should filter branches by name", () => {
    const filtered = filterBranchesByQuery(mockBranches, "dev");
    expect(filtered.length).toBe(1);
    expect(filtered[0].name).toBe("develop");
  });

  it("should be case-insensitive", () => {
    const filtered = filterBranchesByQuery(mockBranches, "MAIN");
    expect(filtered.some((b) => b.name === "main")).toBe(true);
  });

  it("should exclude HEAD by default", () => {
    const branchesWithHead: GitBranch[] = [
      ...mockBranches,
      { name: "HEAD", isCurrent: false, isRemote: false, commit: "xyz" },
    ];
    const filtered = filterBranchesByQuery(branchesWithHead, "");
    expect(filtered.some((b) => b.name === "HEAD")).toBe(false);
  });

  it("should respect limit", () => {
    const filtered = filterBranchesByQuery(mockBranches, "", { limit: 2 });
    expect(filtered.length).toBe(2);
  });
});
