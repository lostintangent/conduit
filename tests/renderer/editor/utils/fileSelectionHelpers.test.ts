import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  selectNextAvailableFile,
  relativePathToFileNode,
} from "../../../../src/renderer/components/panes/editor/utils/fileSelectionHelpers";
import type { GitV2API } from "../../../../src/renderer/api/GitV2API";

// Create a minimal mock GitV2API
function createMockGit(overrides: Partial<GitV2API> = {}): GitV2API {
  return {
    getMostRecentDirtyFile: vi.fn().mockResolvedValue(null),
    getMostRecentCommittedFile: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as GitV2API;
}

describe("fileSelectionHelpers", () => {
  describe("relativePathToFileNode", () => {
    it("should convert relative path to FileNode with trailing slash in cwd", () => {
      const result = relativePathToFileNode("src/index.ts", "/project/");

      expect(result).toEqual({
        path: "/project/src/index.ts",
        name: "index.ts",
        type: "file",
      });
    });

    it("should convert relative path to FileNode without trailing slash in cwd", () => {
      const result = relativePathToFileNode("src/index.ts", "/project");

      expect(result).toEqual({
        path: "/project/src/index.ts",
        name: "index.ts",
        type: "file",
      });
    });

    it("should handle file at root level", () => {
      const result = relativePathToFileNode("package.json", "/project");

      expect(result).toEqual({
        path: "/project/package.json",
        name: "package.json",
        type: "file",
      });
    });

    it("should handle deeply nested file", () => {
      const result = relativePathToFileNode(
        "src/components/ui/Button.tsx",
        "/project",
      );

      expect(result).toEqual({
        path: "/project/src/components/ui/Button.tsx",
        name: "Button.tsx",
        type: "file",
      });
    });
  });

  describe("selectNextAvailableFile", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should return dirty file when available", async () => {
      const mockGit = createMockGit({
        getMostRecentDirtyFile: vi.fn().mockResolvedValue("src/dirty.ts"),
      });

      const result = await selectNextAvailableFile(mockGit, "/project");

      expect(result).toEqual({
        file: {
          path: "/project/src/dirty.ts",
          name: "dirty.ts",
          type: "file",
        },
        relativePath: "src/dirty.ts",
      });
      expect(mockGit.getMostRecentDirtyFile).toHaveBeenCalled();
      expect(mockGit.getMostRecentCommittedFile).not.toHaveBeenCalled();
    });

    it("should fall back to committed file when no dirty files and fallbackToCommitted is true", async () => {
      const mockGit = createMockGit({
        getMostRecentDirtyFile: vi.fn().mockResolvedValue(null),
        getMostRecentCommittedFile: vi
          .fn()
          .mockResolvedValue("src/committed.ts"),
      });

      const result = await selectNextAvailableFile(mockGit, "/project", {
        fallbackToCommitted: true,
      });

      expect(result).toEqual({
        file: {
          path: "/project/src/committed.ts",
          name: "committed.ts",
          type: "file",
        },
        relativePath: "src/committed.ts",
      });
      expect(mockGit.getMostRecentDirtyFile).toHaveBeenCalled();
      expect(mockGit.getMostRecentCommittedFile).toHaveBeenCalledWith(10);
    });

    it("should not fall back to committed file when fallbackToCommitted is false", async () => {
      const mockGit = createMockGit({
        getMostRecentDirtyFile: vi.fn().mockResolvedValue(null),
        getMostRecentCommittedFile: vi
          .fn()
          .mockResolvedValue("src/committed.ts"),
      });

      const result = await selectNextAvailableFile(mockGit, "/project", {
        fallbackToCommitted: false,
      });

      expect(result).toEqual({
        file: null,
        relativePath: null,
      });
      expect(mockGit.getMostRecentDirtyFile).toHaveBeenCalled();
      expect(mockGit.getMostRecentCommittedFile).not.toHaveBeenCalled();
    });

    it("should return null when no files available", async () => {
      const mockGit = createMockGit({
        getMostRecentDirtyFile: vi.fn().mockResolvedValue(null),
        getMostRecentCommittedFile: vi.fn().mockResolvedValue(null),
      });

      const result = await selectNextAvailableFile(mockGit, "/project");

      expect(result).toEqual({
        file: null,
        relativePath: null,
      });
    });

    it("should use custom commit limit", async () => {
      const mockGit = createMockGit({
        getMostRecentDirtyFile: vi.fn().mockResolvedValue(null),
        getMostRecentCommittedFile: vi.fn().mockResolvedValue(null),
      });

      await selectNextAvailableFile(mockGit, "/project", {
        fallbackToCommitted: true,
        commitLimit: 5,
      });

      expect(mockGit.getMostRecentCommittedFile).toHaveBeenCalledWith(5);
    });

    it("should default fallbackToCommitted to true", async () => {
      const mockGit = createMockGit({
        getMostRecentDirtyFile: vi.fn().mockResolvedValue(null),
        getMostRecentCommittedFile: vi
          .fn()
          .mockResolvedValue("src/committed.ts"),
      });

      await selectNextAvailableFile(mockGit, "/project");

      expect(mockGit.getMostRecentCommittedFile).toHaveBeenCalled();
    });

    it("should prioritize dirty file over committed file", async () => {
      const mockGit = createMockGit({
        getMostRecentDirtyFile: vi.fn().mockResolvedValue("src/dirty.ts"),
        getMostRecentCommittedFile: vi
          .fn()
          .mockResolvedValue("src/committed.ts"),
      });

      const result = await selectNextAvailableFile(mockGit, "/project");

      expect(result.relativePath).toBe("src/dirty.ts");
      expect(mockGit.getMostRecentCommittedFile).not.toHaveBeenCalled();
    });
  });
});
