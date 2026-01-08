/**
 * Tests for useAutoOpenFile hook.
 *
 * This hook handles automatic file selection when an editor pane opens:
 * 1. Validates that an initial file path exists
 * 2. Auto-opens the most recently modified file if no valid file is specified
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAutoOpenFile } from "@/components/panes/editor-v2/hooks/useAutoOpenFile";
import type { FileNode, ViewMode } from "@/components/panes/editor-v2/types";

// Mock selectNextAvailableFile utility
vi.mock("@/components/panes/editor-v2/utils/fileSelectionHelpers", () => ({
  selectNextAvailableFile: vi.fn(),
}));

import { selectNextAvailableFile } from "@/components/panes/editor-v2/utils/fileSelectionHelpers";

// Mock file system API
function createMockFs(fileExists = true) {
  return {
    exists: vi.fn().mockResolvedValue(fileExists),
  };
}

// Mock git API
function createMockGit() {
  return {
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

    it("should not auto-open if file is already selected", async () => {
      const existingFile: FileNode = {
        name: "existing.ts",
        path: "/project/existing.ts",
        type: "file",
      };
      const setSelectedFile = vi.fn();
      const setViewMode = vi.fn();

      renderHook(() =>
        useAutoOpenFile({
          initialFilePath: undefined,
          selectedFile: existingFile,
          setSelectedFile,
          cwd: "/project",
          fs: createMockFs() as any,
          git: createMockGit() as any,
          baseBranch: null,
          preferDiffForModified: false,
          setViewMode,
        }),
      );

      // Wait a tick for any async effects
      await new Promise((r) => setTimeout(r, 10));

      expect(selectNextAvailableFile).not.toHaveBeenCalled();
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

      vi.mocked(selectNextAvailableFile).mockRejectedValue(
        new Error("Git error"),
      );

      // Should not throw
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

      // Wait for async error to be caught
      await new Promise((r) => setTimeout(r, 50));

      // Should not have called setSelectedFile due to error
      expect(setSelectedFile).not.toHaveBeenCalled();
    });
  });
});
