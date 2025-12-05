// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import type { Branch, GitFileStatus } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Use hoisted pattern to ensure window.conduit is set up before modules load
const mockApi = vi.hoisted(() => {
  const api = {
    getGitStatus: vi.fn(),
    getBranches: vi.fn(),
    onGitStatusChanged: vi.fn(),
    setBaseBranch: vi.fn(),
    getCurrentBranch: vi.fn(),
  };

  // Set up global window.conduit in hoisted scope
  (global as any).window = {
    conduit: api,
  };

  return api;
});

// Now import the hook after window.conduit is mocked
import { useGitStatus } from "@/components/panes/editor/useGitStatus";

describe("useGitStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    mockApi.getGitStatus.mockResolvedValue({
      success: false,
      gitStatus: null,
    });

    mockApi.getBranches.mockResolvedValue({
      success: false,
      branches: [],
    });

    mockApi.onGitStatusChanged.mockReturnValue(() => {});
    mockApi.setBaseBranch.mockResolvedValue({});
    mockApi.getCurrentBranch.mockResolvedValue(null);
  });

  describe("Initial State", () => {
    it("should initialize with null/empty values", () => {
      const { result } = renderHook(() => useGitStatus("/test/path"));

      expect(result.current.gitStatus).toBeNull();
      expect(result.current.baseBranch).toBeNull();
      expect(result.current.branches).toEqual([]);
      expect(result.current.isBranchSelectorOpen).toBe(false);
      expect(result.current.isInGitRepo).toBe(false);
    });

    it("should provide all expected functions", () => {
      const { result } = renderHook(() => useGitStatus("/test/path"));

      expect(typeof result.current.setIsBranchSelectorOpen).toBe("function");
      expect(typeof result.current.handleBranchSelect).toBe("function");
    });
  });

  describe("Data Loading - Git Status", () => {
    it("should load git status on mount", async () => {
      mockApi.getGitStatus.mockResolvedValue({
        success: true,
        gitStatus: { "file.txt": { status: "modified" } },
      });

      const { result } = renderHook(() => useGitStatus("/test/path"));

      await waitFor(
        () => {
          expect(result.current.gitStatus).not.toBeNull();
        },
        { container: document.body },
      );

      expect(mockApi.getGitStatus).toHaveBeenCalledWith("/test/path");
    });

    it("should convert git status object to Map", async () => {
      const mockStatus = {
        "file.txt": {
          status: "modified",
          staged: false,
          relativePath: "file.txt",
        } as GitFileStatus,
        "other.js": {
          status: "added",
          staged: true,
          relativePath: "other.js",
        } as GitFileStatus,
      };

      mockApi.getGitStatus.mockResolvedValue({
        success: true,
        gitStatus: mockStatus,
      });

      const { result } = renderHook(() => useGitStatus("/test/path"));

      await waitFor(
        () => {
          expect(result.current.gitStatus).toBeInstanceOf(Map);
          expect(result.current.gitStatus?.size).toBe(2);
          expect(result.current.gitStatus?.get("file.txt")).toEqual(
            mockStatus["file.txt"],
          );
        },
        { container: document.body },
      );
    });

    it("should set isInGitRepo to true when git status loads successfully", async () => {
      mockApi.getGitStatus.mockResolvedValue({
        success: true,
        gitStatus: {},
      });
      mockApi.getBranches.mockResolvedValue({
        success: true,
        branches: [],
      });
      mockApi.getCurrentBranch.mockResolvedValue("main");

      const { result } = renderHook(() => useGitStatus("/test/path"));

      await waitFor(
        () => {
          expect(result.current.isInGitRepo).toBe(true);
        },
        { container: document.body },
      );
    });

    it("should set isInGitRepo to false when git status returns error", async () => {
      mockApi.getGitStatus.mockResolvedValue({
        success: false,
        error: "Not a git repository",
      });
      mockApi.getBranches.mockResolvedValue({
        success: false,
        error: "Not a git repository",
      });

      const { result } = renderHook(() => useGitStatus("/test/path"));

      await waitFor(
        () => {
          expect(result.current.isInGitRepo).toBe(false);
        },
        { container: document.body },
      );
    });

    it("should handle git status API errors gracefully", async () => {
      mockApi.getGitStatus.mockRejectedValue(new Error("Network error"));
      mockApi.getBranches.mockResolvedValue({
        success: false,
        branches: [],
      });
      mockApi.getCurrentBranch.mockRejectedValue(new Error("Network error"));

      // Use a unique path to avoid cache contamination
      const { result } = renderHook(() => useGitStatus("/network/error/path"));

      await waitFor(
        () => {
          expect(result.current.gitStatus).toBeNull();
          expect(result.current.isInGitRepo).toBe(false);
        },
        { container: document.body },
      );
    });

    it("should not load git status when cwd is empty", () => {
      renderHook(() => useGitStatus(""));

      expect(mockApi.getGitStatus).not.toHaveBeenCalled();
    });
  });

  describe("Data Loading - Branches", () => {
    it("should load branches on mount", async () => {
      mockApi.getBranches.mockResolvedValue({
        success: true,
        branches: [
          {
            name: "main",
            isRemote: false,
            isCurrent: true,
            lastCommitDate: new Date(),
            lastCommitHash: "abc123",
            lastCommitMessage: "Initial commit",
          } as Branch,
        ],
      });

      const { result } = renderHook(() => useGitStatus("/test/path"));

      await waitFor(
        () => {
          expect(result.current.branches.length).toBeGreaterThan(0);
        },
        { container: document.body },
      );

      expect(mockApi.getBranches).toHaveBeenCalledWith("/test/path");
    });

    it("should update branches state on successful load", async () => {
      const mockBranches: Branch[] = [
        {
          name: "main",
          isRemote: false,
          isCurrent: true,
          lastCommitDate: new Date("2024-01-01"),
          lastCommitHash: "abc123",
          lastCommitMessage: "Initial commit",
        },
        {
          name: "feature",
          isRemote: false,
          isCurrent: false,
          lastCommitDate: new Date("2024-01-02"),
          lastCommitHash: "def456",
          lastCommitMessage: "Add feature",
        },
      ];

      mockApi.getBranches.mockResolvedValue({
        success: true,
        branches: mockBranches,
      });

      const { result } = renderHook(() => useGitStatus("/test/path"));

      await waitFor(
        () => {
          expect(result.current.branches).toEqual(mockBranches);
          expect(result.current.branches.length).toBe(2);
        },
        { container: document.body },
      );
    });

    it("should set isInGitRepo to true when branches load successfully", async () => {
      mockApi.getGitStatus.mockResolvedValue({
        success: true,
        gitStatus: {},
      });
      mockApi.getBranches.mockResolvedValue({
        success: true,
        branches: [
          {
            name: "main",
            isRemote: false,
            isCurrent: true,
            lastCommitDate: new Date(),
            lastCommitHash: "abc123",
            lastCommitMessage: "Initial commit",
          } as Branch,
        ],
      });
      mockApi.getCurrentBranch.mockResolvedValue("main");

      const { result } = renderHook(() => useGitStatus("/test/path"));

      await waitFor(
        () => {
          expect(result.current.isInGitRepo).toBe(true);
        },
        { container: document.body },
      );
    });

    it("should handle branches API errors gracefully", async () => {
      mockApi.getGitStatus.mockResolvedValue({
        success: false,
        gitStatus: null,
      });
      mockApi.getBranches.mockRejectedValue(
        new Error("Failed to fetch branches"),
      );
      mockApi.getCurrentBranch.mockResolvedValue(null);

      // Use a unique path to avoid cache contamination
      const { result } = renderHook(() => useGitStatus("/error/test/path"));

      await waitFor(
        () => {
          expect(result.current.branches).toEqual([]);
        },
        { container: document.body },
      );
    });

    it("should not load branches when cwd is empty", () => {
      renderHook(() => useGitStatus(""));

      expect(mockApi.getBranches).not.toHaveBeenCalled();
    });
  });

  describe("CWD Changes", () => {
    it("should re-fetch git status when cwd changes", async () => {
      mockApi.getGitStatus.mockResolvedValue({
        success: true,
        gitStatus: {},
      });

      const { rerender, result } = renderHook(({ cwd }) => useGitStatus(cwd), {
        initialProps: { cwd: "/path1" },
      });

      await waitFor(
        () => {
          expect(result.current.gitStatus).not.toBeNull();
        },
        { container: document.body },
      );

      expect(mockApi.getGitStatus).toHaveBeenCalledWith("/path1");

      vi.clearAllMocks();

      rerender({ cwd: "/path2" });

      await waitFor(
        () => {
          expect(mockApi.getGitStatus).toHaveBeenCalledWith("/path2");
        },
        { container: document.body },
      );
    });

    it("should re-fetch branches when cwd changes", async () => {
      mockApi.getBranches.mockResolvedValue({
        success: true,
        branches: [],
      });

      const { rerender, result } = renderHook(({ cwd }) => useGitStatus(cwd), {
        initialProps: { cwd: "/path1" },
      });

      await waitFor(
        () => {
          expect(mockApi.getBranches).toHaveBeenCalled();
        },
        { container: document.body },
      );

      expect(mockApi.getBranches).toHaveBeenCalledWith("/path1");

      vi.clearAllMocks();

      rerender({ cwd: "/path2" });

      await waitFor(
        () => {
          expect(mockApi.getBranches).toHaveBeenCalledWith("/path2");
        },
        { container: document.body },
      );
    });
  });

  describe("Event Listeners", () => {
    it("should subscribe to git status change events", () => {
      mockApi.onGitStatusChanged.mockReturnValue(() => {});

      renderHook(() => useGitStatus("/test/path"));

      expect(mockApi.onGitStatusChanged).toHaveBeenCalled();
    });

    it("should handle git status change events for matching cwd", () => {
      let changeHandler: any;
      mockApi.onGitStatusChanged.mockImplementation((handler) => {
        changeHandler = handler;
        return () => {};
      });

      const { result } = renderHook(() => useGitStatus("/test/path"));

      const mockGitStatus = {
        "file.txt": {
          status: "modified",
          staged: false,
          relativePath: "file.txt",
        } as GitFileStatus,
      };

      act(() => {
        changeHandler({
          cwd: "/test/path",
          gitStatus: mockGitStatus,
          baseBranch: "main",
        });
      });

      expect(result.current.gitStatus).toBeInstanceOf(Map);
      expect(result.current.gitStatus?.size).toBe(1);
      expect(result.current.baseBranch).toBe("main");
    });

    it("should convert event payload object to Map", () => {
      let changeHandler: any;
      mockApi.onGitStatusChanged.mockImplementation((handler) => {
        changeHandler = handler;
        return () => {};
      });

      const { result } = renderHook(() => useGitStatus("/test/path"));

      act(() => {
        changeHandler({
          cwd: "/test/path",
          gitStatus: {
            "file1.txt": { status: "modified" } as GitFileStatus,
            "file2.js": { status: "added" } as GitFileStatus,
          },
          baseBranch: null,
        });
      });

      expect(result.current.gitStatus).toBeInstanceOf(Map);
      expect(result.current.gitStatus?.has("file1.txt")).toBe(true);
      expect(result.current.gitStatus?.has("file2.js")).toBe(true);
    });

    it("should handle null git status in events", () => {
      let changeHandler: any;
      mockApi.onGitStatusChanged.mockImplementation((handler) => {
        changeHandler = handler;
        return () => {};
      });

      const { result } = renderHook(() => useGitStatus("/test/path"));

      act(() => {
        changeHandler({
          cwd: "/test/path",
          gitStatus: null,
          baseBranch: null,
        });
      });

      expect(result.current.gitStatus).toBeNull();
    });

    it("should ignore events for different cwd", async () => {
      let changeHandler: any;
      mockApi.onGitStatusChanged.mockImplementation((handler) => {
        changeHandler = handler;
        return () => {};
      });

      const { result } = renderHook(() => useGitStatus("/test/path"));
      const initialStatus = result.current.gitStatus;
      const initialBranch = result.current.baseBranch;

      act(() => {
        changeHandler({
          cwd: "/different/path",
          gitStatus: { "file.txt": { status: "modified" } },
          baseBranch: "feature",
        });
      });

      // Should not update state
      expect(result.current.gitStatus).toBe(initialStatus);
      expect(result.current.baseBranch).toBe(initialBranch);
    });

    it("should clean up event listener on unmount", () => {
      const mockRemoveListener = vi.fn();
      mockApi.onGitStatusChanged.mockReturnValue(mockRemoveListener);

      const { unmount } = renderHook(() => useGitStatus("/test/path"));

      unmount();

      expect(mockRemoveListener).toHaveBeenCalled();
    });

    it("should clean up and re-subscribe when cwd changes", () => {
      const mockRemoveListener1 = vi.fn();
      const mockRemoveListener2 = vi.fn();

      mockApi.onGitStatusChanged
        .mockReturnValueOnce(mockRemoveListener1)
        .mockReturnValueOnce(mockRemoveListener2);

      const { rerender } = renderHook(({ cwd }) => useGitStatus(cwd), {
        initialProps: { cwd: "/path1" },
      });

      expect(mockApi.onGitStatusChanged).toHaveBeenCalledTimes(1);

      rerender({ cwd: "/path2" });

      expect(mockRemoveListener1).toHaveBeenCalled();
      expect(mockApi.onGitStatusChanged).toHaveBeenCalledTimes(2);
    });
  });

  describe("Branch Selection", () => {
    it("should call setBaseBranch API with correct parameters", async () => {
      mockApi.setBaseBranch.mockResolvedValue({});

      const { result } = renderHook(() => useGitStatus("/test/path"));

      await act(async () => {
        await result.current.handleBranchSelect("feature");
      });

      expect(mockApi.setBaseBranch).toHaveBeenCalledWith(
        "/test/path",
        "feature",
      );
    });

    it("should update baseBranch state on successful selection", async () => {
      mockApi.setBaseBranch.mockResolvedValue({});

      const { result } = renderHook(() => useGitStatus("/test/path"));

      await act(async () => {
        await result.current.handleBranchSelect("main");
      });

      expect(result.current.baseBranch).toBe("main");
    });

    it("should close branch selector on successful selection", async () => {
      mockApi.setBaseBranch.mockResolvedValue({});

      const { result } = renderHook(() => useGitStatus("/test/path"));

      // Open the selector first
      act(() => {
        result.current.setIsBranchSelectorOpen(true);
      });

      expect(result.current.isBranchSelectorOpen).toBe(true);

      // Select a branch
      await act(async () => {
        await result.current.handleBranchSelect("main");
      });

      expect(result.current.isBranchSelectorOpen).toBe(false);
    });

    it("should handle null branch selection (HEAD)", async () => {
      mockApi.setBaseBranch.mockResolvedValue({});

      const { result } = renderHook(() => useGitStatus("/test/path"));

      await act(async () => {
        await result.current.handleBranchSelect(null);
      });

      expect(mockApi.setBaseBranch).toHaveBeenCalledWith("/test/path", null);
      expect(result.current.baseBranch).toBe(null);
    });

    it("should handle API errors during branch selection", async () => {
      mockApi.setBaseBranch.mockRejectedValue(
        new Error("Failed to set branch"),
      );

      const { result } = renderHook(() => useGitStatus("/test/path"));

      // Should not throw error
      await act(async () => {
        await result.current.handleBranchSelect("main");
      });

      // Branch selector should still be in its initial state
      expect(result.current.isBranchSelectorOpen).toBe(false);
    });

    it("should handle missing setBaseBranch API gracefully", async () => {
      const apiWithoutSetBranch = { ...mockApi, setBaseBranch: undefined };
      (global.window as any).conduit = apiWithoutSetBranch;

      const { result } = renderHook(() => useGitStatus("/test/path"));

      // Should not throw error
      await act(async () => {
        await result.current.handleBranchSelect("main");
      });

      // Restore mock
      (global.window as any).conduit = mockApi;
    });
  });

  describe("State Management", () => {
    it("should toggle isBranchSelectorOpen", () => {
      const { result } = renderHook(() => useGitStatus("/test/path"));

      expect(result.current.isBranchSelectorOpen).toBe(false);

      act(() => {
        result.current.setIsBranchSelectorOpen(true);
      });

      expect(result.current.isBranchSelectorOpen).toBe(true);

      act(() => {
        result.current.setIsBranchSelectorOpen(false);
      });

      expect(result.current.isBranchSelectorOpen).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty cwd gracefully", () => {
      const { result } = renderHook(() => useGitStatus(""));

      expect(mockApi.getGitStatus).not.toHaveBeenCalled();
      expect(mockApi.getBranches).not.toHaveBeenCalled();
      expect(result.current.gitStatus).toBeNull();
      expect(result.current.branches).toEqual([]);
    });

    it("should handle missing API methods gracefully", () => {
      (global.window as any).conduit = {};

      // Use a unique path to avoid cache contamination
      const { result } = renderHook(() => useGitStatus("/unique/test/path"));

      // Should not crash
      expect(result.current.gitStatus).toBeNull();
      expect(result.current.branches).toEqual([]);

      // Restore mock
      (global.window as any).conduit = mockApi;
    });
  });
});
