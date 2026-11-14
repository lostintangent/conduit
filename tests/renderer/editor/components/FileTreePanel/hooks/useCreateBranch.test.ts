/**
 * Tests for useCreateBranch hook.
 *
 * Tests the hook for creating new branches with state management,
 * keyboard handling, and API integration.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { mockGitWrites } from "../../../../git";
import { renderHook } from "../../../../queryRender";
import { useCreateBranch } from "@/components/panes/editor/components/FileTreePanel/hooks/useCreateBranch";
import type { GitSubscription } from "@features/git/client/GitSubscription";

// ============================================================================
// Mock Git API
// ============================================================================

const CWD = "/repo";

function createMockGitAPI(): GitSubscription {
  return { cwd: CWD } as GitSubscription;
}

// ============================================================================
// Tests
// ============================================================================

describe("useCreateBranch", () => {
  let writes: ReturnType<typeof mockGitWrites>;

  beforeEach(() => {
    vi.clearAllMocks();
    writes = mockGitWrites();
  });

  describe("initial state", () => {
    it("should start with isCreating false", () => {
      const mockGit = createMockGitAPI();

      const { result } = renderHook(() =>
        useCreateBranch(mockGit, { isOpen: true }),
      );

      expect(result.current.isCreating).toBe(false);
      expect(result.current.branchName).toBe("");
      expect(result.current.error).toBeNull();
      expect(result.current.isSubmitting).toBe(false);
    });
  });

  describe("startCreating", () => {
    it("should set isCreating to true", () => {
      const mockGit = createMockGitAPI();

      const { result } = renderHook(() =>
        useCreateBranch(mockGit, { isOpen: true }),
      );

      act(() => {
        result.current.startCreating();
      });

      expect(result.current.isCreating).toBe(true);
    });

    it("should clear any previous error", () => {
      const mockGit = createMockGitAPI();
      writes.createBranch.mockRejectedValue(new Error("Failed"));

      const { result } = renderHook(() =>
        useCreateBranch(mockGit, { isOpen: true }),
      );

      // Start creating and submit to get an error
      act(() => {
        result.current.startCreating();
        result.current.setBranchName("test");
      });

      act(() => {
        result.current.submit();
      });

      // Wait for error to appear
      waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      // Start creating again
      act(() => {
        result.current.startCreating();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("cancel", () => {
    it("should reset all state", () => {
      const mockGit = createMockGitAPI();

      const { result } = renderHook(() =>
        useCreateBranch(mockGit, { isOpen: true }),
      );

      act(() => {
        result.current.startCreating();
        result.current.setBranchName("my-branch");
      });

      expect(result.current.isCreating).toBe(true);
      expect(result.current.branchName).toBe("my-branch");

      act(() => {
        result.current.cancel();
      });

      expect(result.current.isCreating).toBe(false);
      expect(result.current.branchName).toBe("");
      expect(result.current.error).toBeNull();
    });
  });

  describe("submit", () => {
    it("should call createBranch with trimmed name", async () => {
      const mockGit = createMockGitAPI();
      const onBranchCreated = vi.fn();

      const { result } = renderHook(() =>
        useCreateBranch(mockGit, { isOpen: true, onBranchCreated }),
      );

      act(() => {
        result.current.startCreating();
        result.current.setBranchName("  feature/new-branch  ");
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(writes.createBranch).toHaveBeenCalledWith(
        CWD,
        "feature/new-branch",
      );
      expect(onBranchCreated).toHaveBeenCalledWith("feature/new-branch");
    });

    it("should not submit empty branch name", async () => {
      const mockGit = createMockGitAPI();
      const onBranchCreated = vi.fn();

      const { result } = renderHook(() =>
        useCreateBranch(mockGit, { isOpen: true, onBranchCreated }),
      );

      act(() => {
        result.current.startCreating();
        result.current.setBranchName("   ");
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(writes.createBranch).not.toHaveBeenCalled();
      expect(onBranchCreated).not.toHaveBeenCalled();
    });

    it("should reset state on successful submit", async () => {
      const mockGit = createMockGitAPI();

      const { result } = renderHook(() =>
        useCreateBranch(mockGit, { isOpen: true }),
      );

      act(() => {
        result.current.startCreating();
        result.current.setBranchName("new-branch");
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.isCreating).toBe(false);
      expect(result.current.branchName).toBe("");
    });

    it("should set error on failure", async () => {
      const mockGit = createMockGitAPI();
      writes.createBranch.mockRejectedValue(new Error("Branch already exists"));

      const { result } = renderHook(() =>
        useCreateBranch(mockGit, { isOpen: true }),
      );

      act(() => {
        result.current.startCreating();
        result.current.setBranchName("existing-branch");
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(result.current.error).toBe("Branch already exists");
      expect(result.current.isCreating).toBe(true); // Should stay in create mode
    });

    it("should set isSubmitting during submission", async () => {
      let resolveCreate: (() => void) | undefined;
      const createPromise = new Promise<void>((resolve) => {
        resolveCreate = resolve;
      });

      const mockGit = createMockGitAPI();
      writes.createBranch.mockReturnValue(createPromise);

      const { result } = renderHook(() =>
        useCreateBranch(mockGit, { isOpen: true }),
      );

      act(() => {
        result.current.startCreating();
        result.current.setBranchName("new-branch");
      });

      // Start submit but don't await
      let submitPromise: Promise<void>;
      act(() => {
        submitPromise = result.current.submit();
      });

      expect(result.current.isSubmitting).toBe(true);

      // Resolve and wait
      await act(async () => {
        if (resolveCreate) {
          resolveCreate();
        }
        await submitPromise;
      });

      expect(result.current.isSubmitting).toBe(false);
    });
  });

  describe("isOpen effect", () => {
    it("should reset state when isOpen becomes false", () => {
      const mockGit = createMockGitAPI();

      const { result, rerender } = renderHook(
        ({ isOpen }) => useCreateBranch(mockGit, { isOpen }),
        { initialProps: { isOpen: true } },
      );

      act(() => {
        result.current.startCreating();
        result.current.setBranchName("my-branch");
      });

      expect(result.current.isCreating).toBe(true);
      expect(result.current.branchName).toBe("my-branch");

      // Close the dropdown
      rerender({ isOpen: false });

      expect(result.current.isCreating).toBe(false);
      expect(result.current.branchName).toBe("");
      expect(result.current.error).toBeNull();
    });
  });

  describe("handleKeyDown", () => {
    it("should call submit on Enter", async () => {
      const mockGit = createMockGitAPI();
      const onBranchCreated = vi.fn();

      const { result } = renderHook(() =>
        useCreateBranch(mockGit, { isOpen: true, onBranchCreated }),
      );

      act(() => {
        result.current.startCreating();
        result.current.setBranchName("new-branch");
      });

      const mockEvent = {
        key: "Enter",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLInputElement>;

      await act(async () => {
        result.current.handleKeyDown(mockEvent);
      });

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(writes.createBranch).toHaveBeenCalledWith(CWD, "new-branch");
    });

    it("should call cancel on Escape", () => {
      const mockGit = createMockGitAPI();

      const { result } = renderHook(() =>
        useCreateBranch(mockGit, { isOpen: true }),
      );

      act(() => {
        result.current.startCreating();
        result.current.setBranchName("new-branch");
      });

      const mockEvent = {
        key: "Escape",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLInputElement>;

      act(() => {
        result.current.handleKeyDown(mockEvent);
      });

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(result.current.isCreating).toBe(false);
      expect(result.current.branchName).toBe("");
    });

    it("should stop propagation on all keys to prevent menu navigation", () => {
      const mockGit = createMockGitAPI();

      const { result } = renderHook(() =>
        useCreateBranch(mockGit, { isOpen: true }),
      );

      const mockEvent = {
        key: "a",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLInputElement>;

      act(() => {
        result.current.handleKeyDown(mockEvent);
      });

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      // Should not call preventDefault for regular keys
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    });
  });
});
