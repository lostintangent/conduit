import { describe, it, expect } from "vitest";
import {
  getRelativePath,
  isDiffableStatus,
  normalizeMapKey,
} from "../../../../src/renderer/components/panes/editor/utils/gitStatusHelpers";
import type { GitFileStatus } from "@/api/GitV2API";

// Helper to create a minimal GitFileStatus
function createStatus(
  status: GitFileStatus["status"],
  staged = false,
): GitFileStatus {
  return { path: "test.ts", status, staged };
}

describe("gitStatusHelpers", () => {
  describe("normalizeMapKey", () => {
    it("drops the unstaged suffix once the file is no longer partially staged", () => {
      expect(normalizeMapKey("a.ts\0unstaged", ["a.ts"])).toBe("a.ts");
    });

    it("returns the key unchanged when nothing matches", () => {
      expect(normalizeMapKey("gone.ts\0unstaged", ["a.ts"])).toBe(
        "gone.ts\0unstaged",
      );
    });
  });

  describe("isDiffableStatus", () => {
    it("should return true for modified files", () => {
      expect(isDiffableStatus(createStatus("modified"))).toBe(true);
    });

    it("should return true for renamed files", () => {
      expect(isDiffableStatus(createStatus("renamed"))).toBe(true);
    });

    it("should return false for untracked files", () => {
      expect(isDiffableStatus(createStatus("untracked"))).toBe(false);
    });

    it("should return false for added files", () => {
      expect(isDiffableStatus(createStatus("added"))).toBe(false);
    });

    it("should return false for deleted files", () => {
      expect(isDiffableStatus(createStatus("deleted"))).toBe(false);
    });

    it("should return false for undefined status", () => {
      expect(isDiffableStatus(undefined)).toBe(false);
    });
  });

  describe("getRelativePath", () => {
    it("strips the cwd from paths inside it", () => {
      expect(getRelativePath("/a/b/src/x.ts", "/a/b")).toBe("src/x.ts");
      expect(getRelativePath("/a/b/src/x.ts", "/a/b/")).toBe("src/x.ts");
      expect(getRelativePath("/a/b", "/a/b")).toBe("");
    });

    it("leaves sibling paths that share the cwd's prefix unchanged", () => {
      expect(getRelativePath("/a/bc/x.ts", "/a/b")).toBe("/a/bc/x.ts");
    });
  });
});
