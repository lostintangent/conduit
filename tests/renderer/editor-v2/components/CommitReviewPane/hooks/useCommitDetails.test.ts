/**
 * Tests for the useCommitDetails hook.
 *
 * These tests verify the hook behavior:
 * - Loading commit metadata and files
 * - Computing stats
 * - Handling errors
 * - Handling null commitId
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCommitDetails } from "@/components/panes/editor-v2/components/CommitReviewPane/hooks";
import type { GitV2API } from "@/api/GitV2API";
import type {
  HistoryCommit,
  CommitFile,
} from "@/components/panes/editor-v2/components/CommitGraph/types";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock HistoryCommit.
 */
function createMockCommit(
  overrides: Partial<HistoryCommit> = {},
): HistoryCommit {
  return {
    id: "abc123def456789",
    shortId: "abc123d",
    subject: "Fix authentication bug",
    author: "John Doe",
    timestamp: Date.now() / 1000 - 3600,
    parents: ["parent123"],
    refs: [],
    ...overrides,
  };
}

/**
 * Create mock commit files.
 */
function createMockFiles(): CommitFile[] {
  return [
    { path: "src/auth.ts", status: "modified", additions: 10, deletions: 5 },
    { path: "src/utils.ts", status: "added", additions: 25, deletions: 0 },
    { path: "src/old.ts", status: "deleted", additions: 0, deletions: 15 },
  ];
}

/**
 * Create a mock GitV2API.
 */
function createMockGit(
  overrides: Partial<Record<string, unknown>> = {},
): GitV2API {
  return {
    getCommit: vi.fn().mockResolvedValue(createMockCommit()),
    getCommitFiles: vi.fn().mockResolvedValue(createMockFiles()),
    ...overrides,
  } as unknown as GitV2API;
}

// =============================================================================
// Tests
// =============================================================================

describe("useCommitDetails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return loading state initially", () => {
    const git = createMockGit({
      getCommit: vi.fn().mockImplementation(() => new Promise(() => {})),
      getCommitFiles: vi.fn().mockImplementation(() => new Promise(() => {})),
    });

    const { result } = renderHook(() => useCommitDetails("abc123", git));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.commit).toBeNull();
    expect(result.current.files).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("should load commit and files successfully", async () => {
    const git = createMockGit();

    const { result } = renderHook(() => useCommitDetails("abc123", git));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Check commit properties match
    expect(result.current.commit).not.toBeNull();
    expect(result.current.commit?.subject).toBe("Fix authentication bug");
    expect(result.current.commit?.shortId).toBe("abc123d");
    expect(result.current.files.length).toBe(3);
    expect(result.current.error).toBeNull();
  });

  it("should compute stats correctly", async () => {
    const git = createMockGit();

    const { result } = renderHook(() => useCommitDetails("abc123", git));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stats).toEqual({
      filesChanged: 3,
      additions: 35, // 10 + 25 + 0
      deletions: 20, // 5 + 0 + 15
    });
  });

  it("should handle null commitId", async () => {
    const git = createMockGit();

    const { result } = renderHook(() => useCommitDetails(null, git));

    // Should immediately return empty state without loading
    expect(result.current.isLoading).toBe(false);
    expect(result.current.commit).toBeNull();
    expect(result.current.files).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("should handle commit fetch error", async () => {
    const git = createMockGit({
      getCommit: vi.fn().mockRejectedValue(new Error("Network error")),
    });

    const { result } = renderHook(() => useCommitDetails("abc123", git));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.commit).toBeNull();
    expect(result.current.error).toBe("Network error");
  });

  it("should handle files fetch error", async () => {
    const git = createMockGit({
      getCommitFiles: vi.fn().mockRejectedValue(new Error("Files error")),
    });

    const { result } = renderHook(() => useCommitDetails("abc123", git));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Both fetches are in Promise.all, so if one fails, whole request fails
    // This is the expected behavior - we don't want partial data
    expect(result.current.error).toBe("Files error");
    expect(result.current.commit).toBeNull();
    expect(result.current.files).toEqual([]);
  });

  it("should refetch when commitId changes", async () => {
    const commit1 = createMockCommit({
      id: "commit1",
      subject: "First commit",
    });
    const commit2 = createMockCommit({
      id: "commit2",
      subject: "Second commit",
    });

    const getCommit = vi
      .fn()
      .mockResolvedValueOnce(commit1)
      .mockResolvedValueOnce(commit2);

    const git = createMockGit({ getCommit });

    const { result, rerender } = renderHook(
      ({ commitId }) => useCommitDetails(commitId, git),
      { initialProps: { commitId: "commit1" } },
    );

    await waitFor(() => {
      expect(result.current.commit?.subject).toBe("First commit");
    });

    rerender({ commitId: "commit2" });

    await waitFor(() => {
      expect(result.current.commit?.subject).toBe("Second commit");
    });

    expect(getCommit).toHaveBeenCalledTimes(2);
  });

  it("should call git API with correct parameters", async () => {
    const git = createMockGit();

    renderHook(() => useCommitDetails("abc123def", git));

    await waitFor(() => {
      expect(git.getCommit).toHaveBeenCalledWith("abc123def");
      expect(git.getCommitFiles).toHaveBeenCalledWith("abc123def");
    });
  });

  it("should handle empty files list", async () => {
    const git = createMockGit({
      getCommitFiles: vi.fn().mockResolvedValue([]),
    });

    const { result } = renderHook(() => useCommitDetails("abc123", git));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.files).toEqual([]);
    expect(result.current.stats).toEqual({
      filesChanged: 0,
      additions: 0,
      deletions: 0,
    });
  });
});
