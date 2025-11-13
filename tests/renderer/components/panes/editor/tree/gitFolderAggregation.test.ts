import { describe, it, expect } from "vitest";
import { aggregateFolderStatus } from "../../../../../../src/renderer/components/panes/editor/tree/gitFolderAggregation";
import type { GitStatusMap, GitFileStatus } from "@shared/types";

describe("aggregateFolderStatus", () => {
  describe("Basic functionality", () => {
    it("should return null when gitStatus is null", () => {
      const result = aggregateFolderStatus(null, "src");
      expect(result).toBeNull();
    });

    it("should return null when gitStatus is undefined", () => {
      const result = aggregateFolderStatus(undefined, "src");
      expect(result).toBeNull();
    });

    it("should return null when gitStatus is empty", () => {
      const gitStatus: GitStatusMap = new Map();
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result).toBeNull();
    });

    it("should return null when folder has no child files", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "other/file.txt",
          { status: "modified", staged: false, relativePath: "other/file.txt" },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result).toBeNull();
    });
  });

  describe("Child file detection", () => {
    it("should detect files directly under the folder", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/file.txt",
          { status: "modified", staged: false, relativePath: "src/file.txt" },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result).not.toBeNull();
      expect(result?.letter).toBe("M");
      expect(result?.color).toBe("var(--git-modified)");
    });

    it("should detect files in nested subdirectories", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/components/Button.tsx",
          {
            status: "added",
            staged: false,
            relativePath: "src/components/Button.tsx",
          },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result).not.toBeNull();
      expect(result?.letter).toBe("A");
    });

    it("should aggregate multiple files under the folder", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/file1.txt",
          { status: "modified", staged: false, relativePath: "src/file1.txt" },
        ],
        [
          "src/file2.txt",
          { status: "added", staged: false, relativePath: "src/file2.txt" },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result).not.toBeNull();
      // Should return highest weight (added=3 > modified=2)
      expect(result?.letter).toBe("A");
    });
  });

  describe("Deleted file propagation (VS Code spec)", () => {
    it("should filter out deleted files from folder aggregation", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/deleted.txt",
          {
            status: "deleted",
            staged: false,
            relativePath: "src/deleted.txt",
          },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      // Deleted files don't propagate, so folder should have no decoration
      expect(result).toBeNull();
    });

    it("should show decoration when folder has both deleted and non-deleted files", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/deleted.txt",
          {
            status: "deleted",
            staged: false,
            relativePath: "src/deleted.txt",
          },
        ],
        [
          "src/modified.txt",
          {
            status: "modified",
            staged: false,
            relativePath: "src/modified.txt",
          },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      // Should show modified status (deleted is filtered out)
      expect(result).not.toBeNull();
      expect(result?.letter).toBe("M");
    });
  });

  describe("Weight-based priority system", () => {
    it("should prioritize conflict (weight 4) over all other statuses", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/conflict.txt",
          {
            status: "conflict",
            staged: false,
            relativePath: "src/conflict.txt",
          },
        ],
        [
          "src/added.txt",
          { status: "added", staged: false, relativePath: "src/added.txt" },
        ],
        [
          "src/modified.txt",
          {
            status: "modified",
            staged: false,
            relativePath: "src/modified.txt",
          },
        ],
        [
          "src/untracked.txt",
          {
            status: "untracked",
            staged: false,
            relativePath: "src/untracked.txt",
          },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result?.letter).toBe("!");
      expect(result?.weight).toBe(4);
      expect(result?.color).toBe("var(--git-conflict)");
    });

    it("should prioritize added/deleted (weight 3) over modified/renamed (weight 2)", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/modified.txt",
          {
            status: "modified",
            staged: false,
            relativePath: "src/modified.txt",
          },
        ],
        [
          "src/added.txt",
          { status: "added", staged: false, relativePath: "src/added.txt" },
        ],
        [
          "src/renamed.txt",
          {
            status: "renamed",
            staged: false,
            relativePath: "src/renamed.txt",
          },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result?.letter).toBe("A");
      expect(result?.weight).toBe(3);
    });

    it("should prioritize modified (weight 2) over untracked (weight 1)", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/untracked.txt",
          {
            status: "untracked",
            staged: false,
            relativePath: "src/untracked.txt",
          },
        ],
        [
          "src/modified.txt",
          {
            status: "modified",
            staged: false,
            relativePath: "src/modified.txt",
          },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result?.letter).toBe("M");
      expect(result?.weight).toBe(2);
    });

    it("should show untracked (weight 1) when it's the only status", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/new-file.txt",
          {
            status: "untracked",
            staged: false,
            relativePath: "src/new-file.txt",
          },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result?.letter).toBe("U");
      expect(result?.weight).toBe(1);
    });
  });

  describe("All status types", () => {
    it("should handle modified status", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/file.txt",
          { status: "modified", staged: false, relativePath: "src/file.txt" },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result?.letter).toBe("M");
      expect(result?.color).toBe("var(--git-modified)");
      expect(result?.weight).toBe(2);
    });

    it("should handle added status", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/file.txt",
          { status: "added", staged: false, relativePath: "src/file.txt" },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result?.letter).toBe("A");
      expect(result?.color).toBe("var(--git-added)");
      expect(result?.weight).toBe(3);
    });

    it("should handle renamed status", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/file.txt",
          { status: "renamed", staged: false, relativePath: "src/file.txt" },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result?.letter).toBe("R");
      expect(result?.color).toBe("var(--git-renamed)");
      expect(result?.weight).toBe(2);
    });

    it("should handle copied status", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/file.txt",
          { status: "copied", staged: false, relativePath: "src/file.txt" },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result?.letter).toBe("C");
      expect(result?.color).toBe("var(--git-copied)");
      expect(result?.weight).toBe(2);
    });

    it("should handle untracked status", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/file.txt",
          { status: "untracked", staged: false, relativePath: "src/file.txt" },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result?.letter).toBe("U");
      expect(result?.color).toBe("var(--git-untracked)");
      expect(result?.weight).toBe(1);
    });

    it("should handle conflict status", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/file.txt",
          { status: "conflict", staged: false, relativePath: "src/file.txt" },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result?.letter).toBe("!");
      expect(result?.color).toBe("var(--git-conflict)");
      expect(result?.weight).toBe(4);
    });

    it("should handle type-changed status", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/file.txt",
          {
            status: "type-changed",
            staged: false,
            relativePath: "src/file.txt",
          },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result?.letter).toBe("T");
      expect(result?.color).toBe("var(--git-type-changed)");
      expect(result?.weight).toBe(2);
    });

    it("should handle ignored status", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/file.txt",
          { status: "ignored", staged: false, relativePath: "src/file.txt" },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result?.letter).toBe("I");
      expect(result?.color).toBe("var(--git-ignored)");
      expect(result?.weight).toBe(0);
    });

    it("should return null for unmodified status", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/file.txt",
          {
            status: "unmodified",
            staged: false,
            relativePath: "src/file.txt",
          },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result).toBeNull();
    });
  });

  describe("Staged vs unstaged", () => {
    it("should show staged color for deleted files", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/file.txt",
          { status: "deleted", staged: true, relativePath: "src/file.txt" },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      // Deleted files don't propagate regardless of staged status
      expect(result).toBeNull();
    });

    it("should include staged property in label for modified files", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/staged.txt",
          { status: "modified", staged: true, relativePath: "src/staged.txt" },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result?.label).toBe("Modified (staged)");
    });

    it("should include staged property in label for added files", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/staged.txt",
          { status: "added", staged: true, relativePath: "src/staged.txt" },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result?.label).toBe("Added (staged)");
    });
  });

  describe("Edge cases", () => {
    it("should handle root folder (empty path)", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "file.txt",
          { status: "modified", staged: false, relativePath: "file.txt" },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "");
      expect(result).not.toBeNull();
      expect(result?.letter).toBe("M");
    });

    it("should handle folders with trailing slash", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/file.txt",
          { status: "modified", staged: false, relativePath: "src/file.txt" },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src/");
      // Should still work because we append "/" in the function
      expect(result).not.toBeNull();
    });

    it("should not match partial folder names", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "source/file.txt",
          {
            status: "modified",
            staged: false,
            relativePath: "source/file.txt",
          },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      // "source" should not match "src"
      expect(result).toBeNull();
    });

    it("should handle deeply nested folders", () => {
      const gitStatus: GitStatusMap = new Map([
        [
          "src/components/ui/buttons/PrimaryButton.tsx",
          {
            status: "added",
            staged: false,
            relativePath: "src/components/ui/buttons/PrimaryButton.tsx",
          },
        ],
      ]);
      const result = aggregateFolderStatus(gitStatus, "src");
      expect(result).not.toBeNull();
      expect(result?.letter).toBe("A");
    });
  });
});
