/**
 * Tests for useHistoricalDiff hook.
 *
 * This hook loads file content at two specific commits for historical
 * diff viewing. Both sides are read-only.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useHistoricalDiff } from "@/components/panes/editor-v2/hooks/useHistoricalDiff";
import type { GitV2API } from "@/api/GitV2API";

// =============================================================================
// Mocks
// =============================================================================

function createMockGitAPI(overrides: Partial<GitV2API> = {}): GitV2API {
  return {
    getFileAtCommit: vi.fn().mockResolvedValue("file content"),
    getStatus: vi.fn().mockResolvedValue(null),
    getStatusFromBranch: vi.fn().mockResolvedValue(new Map()),
    getFileAtRef: vi.fn().mockResolvedValue("file content"),
    getCurrentBranch: vi.fn().mockResolvedValue("main"),
    hasUpstream: vi.fn().mockResolvedValue(true),
    getHistory: vi.fn().mockResolvedValue([]),
    getCommitFiles: vi.fn().mockResolvedValue([]),
    commit: vi.fn().mockResolvedValue(undefined),
    pull: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue(undefined),
    onStatusChanged: vi.fn().mockReturnValue(() => {}),
    onBranchChanged: vi.fn().mockReturnValue(() => {}),
    whenReady: vi.fn().mockResolvedValue(undefined),
    getBranches: vi.fn().mockResolvedValue([]),
    checkout: vi.fn().mockResolvedValue(undefined),
    createBranch: vi.fn().mockResolvedValue(undefined),
    getMostRecentDirtyFile: vi.fn().mockResolvedValue(null),
    getMostRecentCommittedFile: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as GitV2API;
}

// =============================================================================
// Tests
// =============================================================================

describe("useHistoricalDiff", () => {
  let mockGit: GitV2API;

  beforeEach(() => {
    mockGit = createMockGitAPI();
  });

  describe("initial state", () => {
    it("should start loading when commitId and filePath are provided", () => {
      const { result } = renderHook(() =>
        useHistoricalDiff("abc123", "parent123", "src/index.ts", mockGit),
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.original).toBe(null);
      expect(result.current.modified).toBe(null);
      expect(result.current.error).toBe(null);
    });

    it("should not load when commitId is null", () => {
      const { result } = renderHook(() =>
        useHistoricalDiff(null, "parent123", "src/index.ts", mockGit),
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.original).toBe(null);
      expect(result.current.modified).toBe(null);
    });

    it("should not load when filePath is null", () => {
      const { result } = renderHook(() =>
        useHistoricalDiff("abc123", "parent123", null, mockGit),
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.original).toBe(null);
      expect(result.current.modified).toBe(null);
    });
  });

  describe("successful loading", () => {
    it("should load content from both commits", async () => {
      const mockGitWithContent = createMockGitAPI({
        getFileAtCommit: vi.fn().mockImplementation((commitId, _filePath) => {
          if (commitId === "abc123") {
            return Promise.resolve("modified content");
          }
          return Promise.resolve("original content");
        }),
      });

      const { result } = renderHook(() =>
        useHistoricalDiff(
          "abc123",
          "parent123",
          "src/index.ts",
          mockGitWithContent,
        ),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.original).toBe("original content");
      expect(result.current.modified).toBe("modified content");
      expect(result.current.error).toBe(null);
    });

    it("should call getFileAtCommit with correct parameters", async () => {
      const getFileAtCommit = vi.fn().mockResolvedValue("content");
      const mockGitWithSpy = createMockGitAPI({ getFileAtCommit });

      renderHook(() =>
        useHistoricalDiff(
          "commit123",
          "parent456",
          "src/file.ts",
          mockGitWithSpy,
        ),
      );

      await waitFor(() => {
        expect(getFileAtCommit).toHaveBeenCalledWith(
          "commit123",
          "src/file.ts",
        );
        expect(getFileAtCommit).toHaveBeenCalledWith(
          "parent456",
          "src/file.ts",
        );
      });
    });
  });

  describe("new file handling", () => {
    it("should handle file not in parent commit (new file)", async () => {
      const mockGitWithNewFile = createMockGitAPI({
        getFileAtCommit: vi.fn().mockImplementation((commitId, _filePath) => {
          if (commitId === "abc123") {
            return Promise.resolve("new file content");
          }
          // File doesn't exist in parent
          return Promise.reject(new Error("does not exist"));
        }),
      });

      const { result } = renderHook(() =>
        useHistoricalDiff(
          "abc123",
          "parent123",
          "src/new-file.ts",
          mockGitWithNewFile,
        ),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // New file should show empty original
      expect(result.current.original).toBe("");
      expect(result.current.modified).toBe("new file content");
      expect(result.current.error).toBe(null);
    });
  });

  describe("initial commit handling", () => {
    it("should handle no parent commit (initial commit)", async () => {
      const mockGitWithContent = createMockGitAPI({
        getFileAtCommit: vi.fn().mockResolvedValue("initial content"),
      });

      const { result } = renderHook(() =>
        useHistoricalDiff(
          "abc123",
          "", // Empty parent for initial commit
          "src/index.ts",
          mockGitWithContent,
        ),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Initial commit should show empty original
      expect(result.current.original).toBe("");
      expect(result.current.modified).toBe("initial content");
    });
  });

  describe("error handling", () => {
    it("should handle commit not found error", async () => {
      const mockGitWithError = createMockGitAPI({
        getFileAtCommit: vi
          .fn()
          .mockRejectedValue(new Error("bad revision 'invalid'")),
      });

      const { result } = renderHook(() =>
        useHistoricalDiff(
          "invalid",
          "parent123",
          "src/index.ts",
          mockGitWithError,
        ),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).not.toBe(null);
      expect(result.current.error?.type).toBe("commit_not_found");
    });

    it("should handle file not in commit error", async () => {
      const mockGitWithError = createMockGitAPI({
        getFileAtCommit: vi.fn().mockRejectedValue(new Error("does not exist")),
      });

      const { result } = renderHook(() =>
        useHistoricalDiff(
          "abc123",
          "parent123",
          "nonexistent.ts",
          mockGitWithError,
        ),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).not.toBe(null);
      expect(result.current.error?.type).toBe("file_not_in_commit");
    });

    it("should handle binary file error", async () => {
      const mockGitWithError = createMockGitAPI({
        getFileAtCommit: vi
          .fn()
          .mockRejectedValue(new Error("binary file detected")),
      });

      const { result } = renderHook(() =>
        useHistoricalDiff("abc123", "parent123", "image.png", mockGitWithError),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).not.toBe(null);
      expect(result.current.error?.type).toBe("binary_file");
    });
  });

  describe("parameter changes", () => {
    it("should reload when commitId changes", async () => {
      const getFileAtCommit = vi.fn().mockResolvedValue("content");
      const mockGitWithSpy = createMockGitAPI({ getFileAtCommit });

      const { rerender } = renderHook(
        ({ commitId }) =>
          useHistoricalDiff(
            commitId,
            "parent123",
            "src/index.ts",
            mockGitWithSpy,
          ),
        { initialProps: { commitId: "commit1" } },
      );

      await waitFor(() => {
        expect(getFileAtCommit).toHaveBeenCalledWith("commit1", "src/index.ts");
      });

      // Change commitId
      rerender({ commitId: "commit2" });

      await waitFor(() => {
        expect(getFileAtCommit).toHaveBeenCalledWith("commit2", "src/index.ts");
      });
    });

    it("should reset state when commitId becomes null", async () => {
      const mockGitWithContent = createMockGitAPI({
        getFileAtCommit: vi.fn().mockResolvedValue("content"),
      });

      const { result, rerender } = renderHook(
        ({ commitId }) =>
          useHistoricalDiff(
            commitId,
            "parent123",
            "src/index.ts",
            mockGitWithContent,
          ),
        { initialProps: { commitId: "abc123" as string | null } },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.modified).toBe("content");
      });

      // Set commitId to null
      rerender({ commitId: null });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.original).toBe(null);
      expect(result.current.modified).toBe(null);
    });
  });
});
