import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  selectNextAvailableFile,
  relativePathToFileNode,
} from "../../../../src/renderer/components/panes/editor/utils/fileSelectionHelpers";
import { mockGitReads } from "../../git";

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
    let reads: ReturnType<typeof mockGitReads>;

    beforeEach(() => {
      vi.clearAllMocks();
      reads = mockGitReads();
    });

    it("should return dirty file when available", async () => {
      reads.getMostRecentDirtyFile.mockResolvedValue("src/dirty.ts");

      const result = await selectNextAvailableFile("/project");

      expect(result).toEqual({
        file: {
          path: "/project/src/dirty.ts",
          name: "dirty.ts",
          type: "file",
        },
        relativePath: "src/dirty.ts",
      });
      expect(reads.getMostRecentDirtyFile).toHaveBeenCalledWith("/project");
      expect(reads.getMostRecentCommittedFile).not.toHaveBeenCalled();
    });

    it("should fall back to committed file when no dirty files and fallbackToCommitted is true", async () => {
      reads.getMostRecentDirtyFile.mockResolvedValue(null);
      reads.getMostRecentCommittedFile.mockResolvedValue("src/committed.ts");

      const result = await selectNextAvailableFile("/project", {
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
      expect(reads.getMostRecentDirtyFile).toHaveBeenCalledWith("/project");
      expect(reads.getMostRecentCommittedFile).toHaveBeenCalledWith(
        "/project",
        10,
      );
    });

    it("should not fall back to committed file when fallbackToCommitted is false", async () => {
      reads.getMostRecentDirtyFile.mockResolvedValue(null);
      reads.getMostRecentCommittedFile.mockResolvedValue("src/committed.ts");

      const result = await selectNextAvailableFile("/project", {
        fallbackToCommitted: false,
      });

      expect(result).toEqual({
        file: null,
        relativePath: null,
      });
      expect(reads.getMostRecentDirtyFile).toHaveBeenCalledWith("/project");
      expect(reads.getMostRecentCommittedFile).not.toHaveBeenCalled();
    });

    it("should return null when no files available", async () => {
      reads.getMostRecentDirtyFile.mockResolvedValue(null);
      reads.getMostRecentCommittedFile.mockResolvedValue(null);

      const result = await selectNextAvailableFile("/project");

      expect(result).toEqual({
        file: null,
        relativePath: null,
      });
    });

    it("should use custom commit limit", async () => {
      reads.getMostRecentDirtyFile.mockResolvedValue(null);
      reads.getMostRecentCommittedFile.mockResolvedValue(null);

      await selectNextAvailableFile("/project", {
        fallbackToCommitted: true,
        commitLimit: 5,
      });

      expect(reads.getMostRecentCommittedFile).toHaveBeenCalledWith(
        "/project",
        5,
      );
    });

    it("should default fallbackToCommitted to true", async () => {
      reads.getMostRecentDirtyFile.mockResolvedValue(null);
      reads.getMostRecentCommittedFile.mockResolvedValue("src/committed.ts");

      await selectNextAvailableFile("/project");

      expect(reads.getMostRecentCommittedFile).toHaveBeenCalled();
    });

    it("should prioritize dirty file over committed file", async () => {
      reads.getMostRecentDirtyFile.mockResolvedValue("src/dirty.ts");
      reads.getMostRecentCommittedFile.mockResolvedValue("src/committed.ts");

      const result = await selectNextAvailableFile("/project");

      expect(result.relativePath).toBe("src/dirty.ts");
      expect(reads.getMostRecentCommittedFile).not.toHaveBeenCalled();
    });
  });
});
