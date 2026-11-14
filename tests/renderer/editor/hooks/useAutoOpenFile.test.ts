/**
 * Tests for useAutoOpenFile hook.
 *
 * This hook handles automatic file selection when an editor pane opens:
 * 1. Validates that an initial file path exists
 * 2. Auto-opens the most recently modified file if no valid file is specified
 */

import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { gitKeys } from "@features/git/client/queries";
import { createQueryClient } from "@/query";
import { useAutoOpenFile } from "@/components/panes/editor/hooks/useAutoOpenFile";
import type { FileNode, ViewMode } from "@/components/panes/editor/types";

// Mock selectNextAvailableFile utility
vi.mock("@/components/panes/editor/utils/fileSelectionHelpers", () => ({
  selectNextAvailableFile: vi.fn(),
}));

import { selectNextAvailableFile } from "@/components/panes/editor/utils/fileSelectionHelpers";
import { renderHook } from "../../queryRender";

// Mock file system API
function createMockFs(fileExists = true) {
  return {
    exists: vi.fn().mockResolvedValue(fileExists),
  };
}

// Mock git API
function createMockGit() {
  return {
    cwd: "/project",
    watchedSince: 0,
    whenReady: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({
      files: new Map(),
    }),
  };
}

describe("useAutoOpenFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("when no initial file is provided", () => {
    it("should auto-open most recently modified file", async () => {
      const mockFile: FileNode = {
        name: "index.ts",
        path: "/project/src/index.ts",
        type: "file",
      };
      const setSelectedFile = vi.fn();
      const setViewMode = vi.fn();

      vi.mocked(selectNextAvailableFile).mockResolvedValue({
        file: mockFile,
        relativePath: "src/index.ts",
      });

      renderHook(() =>
        useAutoOpenFile({
          initialFilePath: undefined,
          selectedFile: null,
          setSelectedFile,
          cwd: "/project",
          fs: createMockFs() as any,
          git: createMockGit() as any,
          baseBranch: null,
          preferDiffForModified: false,
          setViewMode,
        }),
      );

      await waitFor(() => {
        expect(setSelectedFile).toHaveBeenCalledWith(mockFile);
      });

      expect(setViewMode).toHaveBeenCalledWith({ type: "editor" });
    });

    it("should show diff view for modified files when preferDiffForModified is true", async () => {
      const mockFile: FileNode = {
        name: "index.ts",
        path: "/project/src/index.ts",
        type: "file",
      };
      const setSelectedFile = vi.fn();
      const setViewMode = vi.fn();

      const mockGit = createMockGit();
      mockGit.getStatus.mockResolvedValue({
        files: new Map([["src/index.ts", { status: "modified" }]]),
      });

      vi.mocked(selectNextAvailableFile).mockResolvedValue({
        file: mockFile,
        relativePath: "src/index.ts",
      });

      renderHook(() =>
        useAutoOpenFile({
          initialFilePath: undefined,
          selectedFile: null,
          setSelectedFile,
          cwd: "/project",
          fs: createMockFs() as any,
          git: mockGit as any,
          baseBranch: "main",
          preferDiffForModified: true,
          setViewMode,
        }),
      );

      await waitFor(() => {
        expect(setViewMode).toHaveBeenCalledWith({
          type: "diff",
          filePath: "/project/src/index.ts",
          baseBranch: "main",
        });
      });
    });

    it("reads modified status from the shared cache instead of git", async () => {
      const mockFile: FileNode = {
        name: "index.ts",
        path: "/project/src/index.ts",
        type: "file",
      };
      const setViewMode = vi.fn();
      const mockGit = createMockGit();
      const queryClient = createQueryClient();
      queryClient.setQueryData(gitKeys.status("/project"), {
        files: new Map([["src/index.ts", { status: "modified" }]]),
      } as any);

      vi.mocked(selectNextAvailableFile).mockResolvedValue({
        file: mockFile,
        relativePath: "src/index.ts",
      });

      renderHook(
        () =>
          useAutoOpenFile({
            initialFilePath: undefined,
            selectedFile: null,
            setSelectedFile: vi.fn(),
            cwd: "/project",
            fs: createMockFs() as any,
            git: mockGit as any,
            baseBranch: "main",
            preferDiffForModified: true,
            setViewMode,
          }),
        { queryClient },
      );

      await waitFor(() => {
        expect(setViewMode).toHaveBeenCalledWith({
          type: "diff",
          filePath: "/project/src/index.ts",
          baseBranch: "main",
        });
      });
      expect(mockGit.getStatus).not.toHaveBeenCalled();
    });

    it("should not auto-open if file is already selected", async () => {
      const existingFile: FileNode = {
        name: "existing.ts",
        path: "/project/existing.ts",
        type: "file",
      };
      const setSelectedFile = vi.fn();
      const setViewMode = vi.fn();
      const git = createMockGit();

      renderHook(() =>
        useAutoOpenFile({
          initialFilePath: undefined,
          selectedFile: existingFile,
          setSelectedFile,
          cwd: "/project",
          fs: createMockFs() as any,
          git: git as any,
          baseBranch: null,
          preferDiffForModified: false,
          setViewMode,
        }),
      );

      // Auto-open calls whenReady synchronously when it starts
      expect(git.whenReady).not.toHaveBeenCalled();
      expect(selectNextAvailableFile).not.toHaveBeenCalled();
      expect(setSelectedFile).not.toHaveBeenCalled();
    });

    // The editor swaps in its real markSeen once git status first loads,
    // which usually happens while the lookup below is still in flight.
    it("should still open the file when markSeen changes during the lookup", async () => {
      const mockFile: FileNode = {
        name: "index.ts",
        path: "/project/src/index.ts",
        type: "file",
      };
      const setSelectedFile = vi.fn();
      const placeholderMarkSeen = vi.fn();
      const loadedMarkSeen = vi.fn();
      const fs = createMockFs();
      const git = createMockGit();

      let resolveLookup!: (result: {
        file: FileNode;
        relativePath: string;
      }) => void;
      vi.mocked(selectNextAvailableFile).mockReturnValue(
        new Promise((resolve) => {
          resolveLookup = resolve;
        }),
      );

      const { rerender } = renderHook(
        (markSeen: (path: string) => void) =>
          useAutoOpenFile({
            initialFilePath: undefined,
            selectedFile: null,
            setSelectedFile,
            cwd: "/project",
            fs: fs as any,
            git: git as any,
            baseBranch: null,
            preferDiffForModified: false,
            setViewMode: vi.fn(),
            markSeen,
          }),
        { initialProps: placeholderMarkSeen },
      );

      await waitFor(() => {
        expect(selectNextAvailableFile).toHaveBeenCalled();
      });
      rerender(loadedMarkSeen);
      await act(async () => {
        resolveLookup({ file: mockFile, relativePath: "src/index.ts" });
      });

      await waitFor(() => {
        expect(setSelectedFile).toHaveBeenCalledWith(mockFile);
      });
      expect(loadedMarkSeen).toHaveBeenCalledWith("src/index.ts");
      expect(placeholderMarkSeen).not.toHaveBeenCalled();
    });

    it("should not replace a file the user selects during the lookup", async () => {
      const userFile: FileNode = {
        name: "picked.ts",
        path: "/project/picked.ts",
        type: "file",
      };
      const setSelectedFile = vi.fn();
      const fs = createMockFs();
      const git = createMockGit();

      let resolveLookup!: (result: {
        file: FileNode;
        relativePath: string;
      }) => void;
      vi.mocked(selectNextAvailableFile).mockReturnValue(
        new Promise((resolve) => {
          resolveLookup = resolve;
        }),
      );

      const { rerender } = renderHook(
        (selectedFile: FileNode | null) =>
          useAutoOpenFile({
            initialFilePath: undefined,
            selectedFile,
            setSelectedFile,
            cwd: "/project",
            fs: fs as any,
            git: git as any,
            baseBranch: null,
            preferDiffForModified: false,
            setViewMode: vi.fn(),
          }),
        { initialProps: null as FileNode | null },
      );

      await waitFor(() => {
        expect(selectNextAvailableFile).toHaveBeenCalled();
      });
      rerender(userFile);
      await act(async () => {
        resolveLookup({
          file: {
            name: "index.ts",
            path: "/project/src/index.ts",
            type: "file",
          },
          relativePath: "src/index.ts",
        });
      });

      expect(setSelectedFile).not.toHaveBeenCalled();
    });
  });

  describe("when initial file is provided", () => {
    it("should keep selection if initial file exists", async () => {
      const initialFile: FileNode = {
        name: "initial.ts",
        path: "/project/initial.ts",
        type: "file",
      };
      const setSelectedFile = vi.fn();
      const setViewMode = vi.fn();
      const mockFs = createMockFs(true);

      renderHook(() =>
        useAutoOpenFile({
          initialFilePath: "/project/initial.ts",
          selectedFile: initialFile,
          setSelectedFile,
          cwd: "/project",
          fs: mockFs as any,
          git: createMockGit() as any,
          baseBranch: null,
          preferDiffForModified: false,
          setViewMode,
        }),
      );

      await waitFor(() => {
        expect(mockFs.exists).toHaveBeenCalledWith("/project/initial.ts");
      });

      // Should not clear selection since file exists
      expect(setSelectedFile).not.toHaveBeenCalledWith(null);
    });

    it("should trigger auto-open if initial file does not exist", async () => {
      const initialFile: FileNode = {
        name: "missing.ts",
        path: "/project/missing.ts",
        type: "file",
      };
      const setSelectedFile = vi.fn();
      const setViewMode = vi.fn();
      const mockFs = createMockFs(false); // File doesn't exist

      renderHook(() =>
        useAutoOpenFile({
          initialFilePath: "/project/missing.ts",
          selectedFile: initialFile,
          setSelectedFile,
          cwd: "/project",
          fs: mockFs as any,
          git: createMockGit() as any,
          baseBranch: null,
          preferDiffForModified: false,
          setViewMode,
        }),
      );

      await waitFor(() => {
        expect(mockFs.exists).toHaveBeenCalledWith("/project/missing.ts");
      });

      // Should clear selection to trigger auto-open
      expect(setSelectedFile).toHaveBeenCalledWith(null);
    });
  });

  describe("error handling", () => {
    it("should handle fs.exists errors gracefully", async () => {
      const initialFile: FileNode = {
        name: "file.ts",
        path: "/project/file.ts",
        type: "file",
      };
      const setSelectedFile = vi.fn();
      const setViewMode = vi.fn();
      const mockFs = {
        exists: vi.fn().mockRejectedValue(new Error("FS error")),
      };

      // Should not throw
      renderHook(() =>
        useAutoOpenFile({
          initialFilePath: "/project/file.ts",
          selectedFile: initialFile,
          setSelectedFile,
          cwd: "/project",
          fs: mockFs as any,
          git: createMockGit() as any,
          baseBranch: null,
          preferDiffForModified: false,
          setViewMode,
        }),
      );

      await waitFor(() => {
        expect(mockFs.exists).toHaveBeenCalled();
      });

      // On error, should assume file exists and not clear selection
      expect(setSelectedFile).not.toHaveBeenCalledWith(null);
    });

    it("should handle selectNextAvailableFile errors gracefully", async () => {
      const setSelectedFile = vi.fn();
      const setViewMode = vi.fn();

      const error = new Error("Git error");
      vi.mocked(selectNextAvailableFile).mockRejectedValue(error);
      const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

      renderHook(() =>
        useAutoOpenFile({
          initialFilePath: undefined,
          selectedFile: null,
          setSelectedFile,
          cwd: "/project",
          fs: createMockFs() as any,
          git: createMockGit() as any,
          baseBranch: null,
          preferDiffForModified: false,
          setViewMode,
        }),
      );

      await waitFor(() =>
        expect(debug).toHaveBeenCalledWith(
          "[useAutoOpenFile] Auto-open failed:",
          error,
        ),
      );
      expect(setSelectedFile).not.toHaveBeenCalled();
      debug.mockRestore();
    });
  });
});
