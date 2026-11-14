import { describe, it, expect } from "vitest";
import { getRelativePath } from "./pathUtils";

describe("pathUtils", () => {
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
