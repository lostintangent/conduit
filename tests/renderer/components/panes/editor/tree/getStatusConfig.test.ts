import { describe, it, expect } from "vitest";
import { getStatusConfig } from "../../../../../../src/renderer/components/panes/editor/tree/GitStatusBadge";
import type { GitFileStatus } from "@shared/types";

describe("getStatusConfig", () => {
  describe("Modified status", () => {
    it("should return correct config for unstaged modified file", () => {
      const status: GitFileStatus = {
        status: "modified",
        staged: false,
        relativePath: "file.txt",
      };
      const config = getStatusConfig(status);

      expect(config).toEqual({
        letter: "M",
        color: "var(--git-modified)",
        label: "Modified",
        weight: 2,
      });
    });

    it("should return correct config for staged modified file", () => {
      const status: GitFileStatus = {
        status: "modified",
        staged: true,
        relativePath: "file.txt",
      };
      const config = getStatusConfig(status);

      expect(config).toEqual({
        letter: "M",
        color: "var(--git-modified)",
        label: "Modified (staged)",
        weight: 2,
      });
    });
  });

  describe("Added status", () => {
    it("should return correct config for unstaged added file", () => {
      const status: GitFileStatus = {
        status: "added",
        staged: false,
        relativePath: "file.txt",
      };
      const config = getStatusConfig(status);

      expect(config).toEqual({
        letter: "A",
        color: "var(--git-added)",
        label: "Added",
        weight: 3,
      });
    });

    it("should return correct config for staged added file", () => {
      const status: GitFileStatus = {
        status: "added",
        staged: true,
        relativePath: "file.txt",
      };
      const config = getStatusConfig(status);

      expect(config).toEqual({
        letter: "A",
        color: "var(--git-added)",
        label: "Added (staged)",
        weight: 3,
      });
    });
  });

  describe("Deleted status", () => {
    it("should return correct config for unstaged deleted file", () => {
      const status: GitFileStatus = {
        status: "deleted",
        staged: false,
        relativePath: "file.txt",
      };
      const config = getStatusConfig(status);

      expect(config).toEqual({
        letter: "D",
        color: "var(--git-deleted)",
        label: "Deleted",
        weight: 3,
      });
    });

    it("should return correct config for staged deleted file", () => {
      const status: GitFileStatus = {
        status: "deleted",
        staged: true,
        relativePath: "file.txt",
      };
      const config = getStatusConfig(status);

      expect(config).toEqual({
        letter: "D",
        color: "var(--git-deleted-staged)",
        label: "Deleted (staged)",
        weight: 3,
      });
    });
  });

  describe("Renamed status", () => {
    it("should return correct config for renamed file", () => {
      const status: GitFileStatus = {
        status: "renamed",
        staged: false,
        relativePath: "file.txt",
      };
      const config = getStatusConfig(status);

      expect(config).toEqual({
        letter: "R",
        color: "var(--git-renamed)",
        label: "Renamed",
        weight: 2,
      });
    });
  });

  describe("Copied status", () => {
    it("should return correct config for copied file", () => {
      const status: GitFileStatus = {
        status: "copied",
        staged: false,
        relativePath: "file.txt",
      };
      const config = getStatusConfig(status);

      expect(config).toEqual({
        letter: "C",
        color: "var(--git-copied)",
        label: "Copied",
        weight: 2,
      });
    });
  });

  describe("Untracked status", () => {
    it("should return correct config for untracked file", () => {
      const status: GitFileStatus = {
        status: "untracked",
        staged: false,
        relativePath: "file.txt",
      };
      const config = getStatusConfig(status);

      expect(config).toEqual({
        letter: "U",
        color: "var(--git-untracked)",
        label: "Untracked",
        weight: 1,
      });
    });
  });

  describe("Conflict status", () => {
    it("should return correct config for conflict file", () => {
      const status: GitFileStatus = {
        status: "conflict",
        staged: false,
        relativePath: "file.txt",
      };
      const config = getStatusConfig(status);

      expect(config).toEqual({
        letter: "!",
        color: "var(--git-conflict)",
        label: "Conflict",
        weight: 4,
      });
    });
  });

  describe("Type-changed status", () => {
    it("should return correct config for type-changed file", () => {
      const status: GitFileStatus = {
        status: "type-changed",
        staged: false,
        relativePath: "file.txt",
      };
      const config = getStatusConfig(status);

      expect(config).toEqual({
        letter: "T",
        color: "var(--git-type-changed)",
        label: "Type Changed",
        weight: 2,
      });
    });
  });

  describe("Ignored status", () => {
    it("should return correct config for ignored file", () => {
      const status: GitFileStatus = {
        status: "ignored",
        staged: false,
        relativePath: "file.txt",
      };
      const config = getStatusConfig(status);

      expect(config).toEqual({
        letter: "I",
        color: "var(--git-ignored)",
        label: "Ignored",
        weight: 0,
      });
    });
  });

  describe("Unmodified status", () => {
    it("should return null for unmodified file", () => {
      const status: GitFileStatus = {
        status: "unmodified",
        staged: false,
        relativePath: "file.txt",
      };
      const config = getStatusConfig(status);

      expect(config).toBeNull();
    });
  });

  describe("Weight priority verification", () => {
    it("should assign correct weights for priority ordering", () => {
      const statuses: GitFileStatus[] = [
        { status: "conflict", staged: false, relativePath: "file1.txt" },
        { status: "added", staged: false, relativePath: "file2.txt" },
        { status: "deleted", staged: false, relativePath: "file3.txt" },
        { status: "modified", staged: false, relativePath: "file4.txt" },
        { status: "renamed", staged: false, relativePath: "file5.txt" },
        { status: "copied", staged: false, relativePath: "file6.txt" },
        { status: "type-changed", staged: false, relativePath: "file7.txt" },
        { status: "untracked", staged: false, relativePath: "file8.txt" },
        { status: "ignored", staged: false, relativePath: "file9.txt" },
      ];

      const configs = statuses
        .map(getStatusConfig)
        .filter((c) => c !== null)
        .sort((a, b) => b.weight - a.weight);

      // Verify priority order: conflict > added/deleted > modified/renamed/copied/type-changed > untracked > ignored
      expect(configs[0].letter).toBe("!"); // conflict, weight 4
      expect(configs[0].weight).toBe(4);

      expect(["A", "D"]).toContain(configs[1].letter); // added or deleted, weight 3
      expect(configs[1].weight).toBe(3);

      expect(["A", "D"]).toContain(configs[2].letter); // the other one (added or deleted), weight 3
      expect(configs[2].weight).toBe(3);

      expect(["M", "R", "C", "T"]).toContain(configs[3].letter); // modified/renamed/copied/type-changed, weight 2
      expect(configs[3].weight).toBe(2);

      expect(configs[7].letter).toBe("U"); // untracked, weight 1
      expect(configs[7].weight).toBe(1);

      expect(configs[8].letter).toBe("I"); // ignored, weight 0
      expect(configs[8].weight).toBe(0);
    });
  });

  describe("Color CSS variables", () => {
    it("should use correct CSS variable for each status", () => {
      const testCases: Array<{
        status: GitFileStatus["status"];
        expectedColor: string;
      }> = [
        { status: "modified", expectedColor: "var(--git-modified)" },
        { status: "added", expectedColor: "var(--git-added)" },
        { status: "deleted", expectedColor: "var(--git-deleted)" },
        { status: "renamed", expectedColor: "var(--git-renamed)" },
        { status: "copied", expectedColor: "var(--git-copied)" },
        { status: "untracked", expectedColor: "var(--git-untracked)" },
        { status: "conflict", expectedColor: "var(--git-conflict)" },
        { status: "type-changed", expectedColor: "var(--git-type-changed)" },
        { status: "ignored", expectedColor: "var(--git-ignored)" },
      ];

      testCases.forEach(({ status, expectedColor }) => {
        const fileStatus: GitFileStatus = {
          status,
          staged: false,
          relativePath: "file.txt",
        };
        const config = getStatusConfig(fileStatus);
        expect(config?.color).toBe(expectedColor);
      });
    });

    it("should use different color for staged deleted files", () => {
      const staged: GitFileStatus = {
        status: "deleted",
        staged: true,
        relativePath: "file.txt",
      };
      const unstaged: GitFileStatus = {
        status: "deleted",
        staged: false,
        relativePath: "file.txt",
      };

      const stagedConfig = getStatusConfig(staged);
      const unstagedConfig = getStatusConfig(unstaged);

      expect(stagedConfig?.color).toBe("var(--git-deleted-staged)");
      expect(unstagedConfig?.color).toBe("var(--git-deleted)");
    });
  });

  describe("Letter badges", () => {
    it("should return single-character letters for all statuses", () => {
      const statuses: GitFileStatus["status"][] = [
        "modified",
        "added",
        "deleted",
        "renamed",
        "copied",
        "untracked",
        "conflict",
        "type-changed",
        "ignored",
      ];

      statuses.forEach((status) => {
        const fileStatus: GitFileStatus = {
          status,
          staged: false,
          relativePath: "file.txt",
        };
        const config = getStatusConfig(fileStatus);
        expect(config?.letter).toBeDefined();
        expect(config?.letter.length).toBe(1);
      });
    });

    it("should return correct letter for each status", () => {
      const expectedLetters: Record<
        Exclude<GitFileStatus["status"], "unmodified">,
        string
      > = {
        modified: "M",
        added: "A",
        deleted: "D",
        renamed: "R",
        copied: "C",
        untracked: "U",
        conflict: "!",
        "type-changed": "T",
        ignored: "I",
      };

      Object.entries(expectedLetters).forEach(([status, expectedLetter]) => {
        const fileStatus: GitFileStatus = {
          status: status as GitFileStatus["status"],
          staged: false,
          relativePath: "file.txt",
        };
        const config = getStatusConfig(fileStatus);
        expect(config?.letter).toBe(expectedLetter);
      });
    });
  });
});
