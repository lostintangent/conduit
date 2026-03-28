/**
 * Tests for parseRefs utilities.
 *
 * These tests verify the git ref parsing logic that converts raw git ref strings
 * from git log --decorate format into structured GitRef objects.
 */

import { describe, it, expect } from "vitest";
import {
  parseRef,
  parseRefs,
  filterRefsForDisplay,
  sortRefs,
  filterRefsByType,
  getHeadRef,
  hasRefs,
} from "@/components/panes/editor/components/CommitGraph/refs/parseRefs";
import type { GitRef } from "@/components/panes/editor/components/CommitGraph/types";

// =============================================================================
// parseRef Tests
// =============================================================================

describe("parseRef", () => {
  describe("HEAD -> branch pattern", () => {
    it("should parse HEAD -> main as head type with isHead flag", () => {
      const result = parseRef("HEAD -> main");
      expect(result).toEqual({
        type: "head",
        name: "main",
        isHead: true,
      });
    });

    it("should parse HEAD -> feature/test as head type with full branch name", () => {
      const result = parseRef("HEAD -> feature/test");
      expect(result).toEqual({
        type: "head",
        name: "feature/test",
        isHead: true,
      });
    });

    it("should handle branch names with special characters", () => {
      const result = parseRef("HEAD -> fix/bug-123_test");
      expect(result).toEqual({
        type: "head",
        name: "fix/bug-123_test",
        isHead: true,
      });
    });
  });

  describe("remote refs", () => {
    it("should parse origin/main as remote type", () => {
      const result = parseRef("origin/main");
      expect(result).toEqual({
        type: "remote",
        name: "main",
        remote: "origin",
      });
    });

    it("should parse upstream/develop as remote type", () => {
      const result = parseRef("upstream/develop");
      expect(result).toEqual({
        type: "remote",
        name: "develop",
        remote: "upstream",
      });
    });

    it("should handle nested branch names on remotes", () => {
      const result = parseRef("origin/feature/new-thing");
      expect(result).toEqual({
        type: "remote",
        name: "feature/new-thing",
        remote: "origin",
      });
    });

    it("should skip origin/HEAD", () => {
      const result = parseRef("origin/HEAD");
      expect(result).toBeNull();
    });

    it("should skip upstream/HEAD", () => {
      const result = parseRef("upstream/HEAD");
      expect(result).toBeNull();
    });
  });

  describe("tags", () => {
    it("should parse tag: v1.0.0 as tag type", () => {
      const result = parseRef("tag: v1.0.0");
      expect(result).toEqual({
        type: "tag",
        name: "v1.0.0",
      });
    });

    it("should handle tags with various formats", () => {
      expect(parseRef("tag: release-2024.01")).toEqual({
        type: "tag",
        name: "release-2024.01",
      });
      expect(parseRef("tag: 1.0")).toEqual({
        type: "tag",
        name: "1.0",
      });
    });
  });

  describe("local branches", () => {
    it("should parse plain branch name as head type", () => {
      const result = parseRef("main");
      expect(result).toEqual({
        type: "head",
        name: "main",
      });
    });

    it("should not have isHead flag for non-current branches", () => {
      const result = parseRef("develop");
      expect(result?.isHead).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should skip standalone HEAD", () => {
      const result = parseRef("HEAD");
      expect(result).toBeNull();
    });

    it("should handle empty string", () => {
      const result = parseRef("");
      expect(result).toBeNull();
    });

    it("should handle whitespace-only string", () => {
      const result = parseRef("   ");
      expect(result).toBeNull();
    });

    it("should trim whitespace from refs", () => {
      const result = parseRef("  main  ");
      expect(result).toEqual({
        type: "head",
        name: "main",
      });
    });
  });
});

// =============================================================================
// parseRefs Tests
// =============================================================================

describe("parseRefs", () => {
  it("should parse multiple refs and sort them", () => {
    const result = parseRefs(["HEAD -> main", "origin/main", "tag: v1.0"]);
    expect(result).toHaveLength(3);
    // HEAD should be first
    expect(result[0]).toEqual({
      type: "head",
      name: "main",
      isHead: true,
    });
  });

  it("should filter out null refs", () => {
    const result = parseRefs([
      "HEAD -> main",
      "HEAD",
      "origin/HEAD",
      "origin/main",
    ]);
    expect(result).toHaveLength(2); // Only main refs, not standalone HEAD or origin/HEAD
  });

  it("should handle undefined input", () => {
    const result = parseRefs(undefined);
    expect(result).toEqual([]);
  });

  it("should handle empty array", () => {
    const result = parseRefs([]);
    expect(result).toEqual([]);
  });

  it("should maintain sorted order", () => {
    const result = parseRefs([
      "tag: v1.0",
      "origin/main",
      "HEAD -> main",
      "develop",
    ]);
    expect(result[0].isHead).toBe(true); // HEAD first
    expect(result[1].type).toBe("head"); // then local branches
    expect(result[2].type).toBe("remote"); // then remote
    expect(result[3].type).toBe("tag"); // then tags
  });
});

// =============================================================================
// sortRefs Tests
// =============================================================================

describe("sortRefs", () => {
  it("should put HEAD ref first", () => {
    const refs: GitRef[] = [
      { type: "head", name: "develop" },
      { type: "head", name: "main", isHead: true },
      { type: "remote", name: "main", remote: "origin" },
    ];
    const result = sortRefs(refs);
    expect(result[0].isHead).toBe(true);
  });

  it("should sort by type priority: head > remote > tag", () => {
    const refs: GitRef[] = [
      { type: "tag", name: "v1.0" },
      { type: "remote", name: "main", remote: "origin" },
      { type: "head", name: "feature" },
    ];
    const result = sortRefs(refs);
    expect(result[0].type).toBe("head");
    expect(result[1].type).toBe("remote");
    expect(result[2].type).toBe("tag");
  });

  it("should sort same-type refs alphabetically by name", () => {
    const refs: GitRef[] = [
      { type: "head", name: "zebra" },
      { type: "head", name: "alpha" },
      { type: "head", name: "beta" },
    ];
    const result = sortRefs(refs);
    expect(result.map((r) => r.name)).toEqual(["alpha", "beta", "zebra"]);
  });

  it("should sort remote refs by remote name then branch name", () => {
    const refs: GitRef[] = [
      { type: "remote", name: "main", remote: "upstream" },
      { type: "remote", name: "develop", remote: "origin" },
      { type: "remote", name: "main", remote: "origin" },
    ];
    const result = sortRefs(refs);
    expect(result[0]).toEqual({
      type: "remote",
      name: "develop",
      remote: "origin",
    });
    expect(result[1]).toEqual({
      type: "remote",
      name: "main",
      remote: "origin",
    });
    expect(result[2]).toEqual({
      type: "remote",
      name: "main",
      remote: "upstream",
    });
  });

  it("should not mutate original array", () => {
    const refs: GitRef[] = [
      { type: "tag", name: "v1.0" },
      { type: "head", name: "main" },
    ];
    const original = [...refs];
    sortRefs(refs);
    expect(refs).toEqual(original);
  });
});

// =============================================================================
// filterRefsForDisplay Tests
// =============================================================================

describe("filterRefsForDisplay", () => {
  describe("HEAD commit filtering", () => {
    it("should show HEAD ref for HEAD commit", () => {
      const refs: GitRef[] = [
        { type: "head", name: "main", isHead: true },
        { type: "head", name: "other-branch" },
        { type: "remote", name: "main", remote: "origin" },
      ];
      const result = filterRefsForDisplay(refs);
      expect(result.find((r) => r.isHead)).toBeDefined();
    });

    it("should show upstream of current branch", () => {
      const refs: GitRef[] = [
        { type: "head", name: "main", isHead: true },
        { type: "remote", name: "main", remote: "origin" },
        { type: "remote", name: "develop", remote: "origin" },
      ];
      const result = filterRefsForDisplay(refs);
      expect(result).toContainEqual({
        type: "remote",
        name: "main",
        remote: "origin",
      });
      expect(result).not.toContainEqual({
        type: "remote",
        name: "develop",
        remote: "origin",
      });
    });

    it("should filter out non-upstream remote branches", () => {
      const refs: GitRef[] = [
        { type: "head", name: "main", isHead: true },
        { type: "remote", name: "other", remote: "origin" },
      ];
      const result = filterRefsForDisplay(refs);
      expect(result).not.toContainEqual({
        type: "remote",
        name: "other",
        remote: "origin",
      });
    });

    it("should filter out other local branches", () => {
      const refs: GitRef[] = [
        { type: "head", name: "main", isHead: true },
        { type: "head", name: "testtest" },
        { type: "head", name: "feature" },
      ];
      const result = filterRefsForDisplay(refs);
      expect(result).toHaveLength(1);
      expect(result[0].isHead).toBe(true);
    });

    it("should always show tags on HEAD commit", () => {
      const refs: GitRef[] = [
        { type: "head", name: "main", isHead: true },
        { type: "tag", name: "v1.0.0" },
        { type: "head", name: "other" },
      ];
      const result = filterRefsForDisplay(refs);
      expect(result).toContainEqual({ type: "tag", name: "v1.0.0" });
    });
  });

  describe("non-HEAD commit filtering", () => {
    it("should only show tags for non-HEAD commits", () => {
      const refs: GitRef[] = [
        { type: "head", name: "main" }, // No isHead flag
        { type: "remote", name: "main", remote: "origin" },
        { type: "tag", name: "v1.0.0" },
      ];
      const result = filterRefsForDisplay(refs);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: "tag", name: "v1.0.0" });
    });

    it("should return empty array if no tags on non-HEAD commit", () => {
      const refs: GitRef[] = [
        { type: "head", name: "main" },
        { type: "remote", name: "main", remote: "origin" },
      ];
      const result = filterRefsForDisplay(refs);
      expect(result).toEqual([]);
    });
  });

  it("should handle empty array", () => {
    const result = filterRefsForDisplay([]);
    expect(result).toEqual([]);
  });
});

// =============================================================================
// filterRefsByType Tests
// =============================================================================

describe("filterRefsByType", () => {
  const refs: GitRef[] = [
    { type: "head", name: "main", isHead: true },
    { type: "head", name: "develop" },
    { type: "remote", name: "main", remote: "origin" },
    { type: "tag", name: "v1.0" },
  ];

  it("should filter to only head refs", () => {
    const result = filterRefsByType(refs, ["head"]);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.type === "head")).toBe(true);
  });

  it("should filter to only remote refs", () => {
    const result = filterRefsByType(refs, ["remote"]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("remote");
  });

  it("should filter to only tag refs", () => {
    const result = filterRefsByType(refs, ["tag"]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("tag");
  });

  it("should filter to multiple types", () => {
    const result = filterRefsByType(refs, ["head", "remote"]);
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.type === "head" || r.type === "remote")).toBe(
      true,
    );
  });

  it("should return empty array for no matching types", () => {
    const refs: GitRef[] = [{ type: "head", name: "main" }];
    const result = filterRefsByType(refs, ["tag"]);
    expect(result).toEqual([]);
  });
});

// =============================================================================
// getHeadRef Tests
// =============================================================================

describe("getHeadRef", () => {
  it("should return the HEAD ref when present", () => {
    const refs: GitRef[] = [
      { type: "head", name: "develop" },
      { type: "head", name: "main", isHead: true },
      { type: "remote", name: "main", remote: "origin" },
    ];
    const result = getHeadRef(refs);
    expect(result).toEqual({ type: "head", name: "main", isHead: true });
  });

  it("should return undefined when no HEAD ref", () => {
    const refs: GitRef[] = [
      { type: "head", name: "develop" },
      { type: "remote", name: "main", remote: "origin" },
    ];
    const result = getHeadRef(refs);
    expect(result).toBeUndefined();
  });

  it("should return undefined for empty array", () => {
    const result = getHeadRef([]);
    expect(result).toBeUndefined();
  });
});

// =============================================================================
// hasRefs Tests
// =============================================================================

describe("hasRefs", () => {
  it("should return true for valid refs", () => {
    expect(hasRefs(["HEAD -> main"])).toBe(true);
    expect(hasRefs(["origin/main"])).toBe(true);
    expect(hasRefs(["tag: v1.0"])).toBe(true);
    expect(hasRefs(["main"])).toBe(true);
  });

  it("should return false for only skipped refs", () => {
    expect(hasRefs(["HEAD"])).toBe(false);
    expect(hasRefs(["origin/HEAD"])).toBe(false);
    expect(hasRefs(["HEAD", "origin/HEAD"])).toBe(false);
  });

  it("should return true if at least one valid ref", () => {
    expect(hasRefs(["HEAD", "main"])).toBe(true);
    expect(hasRefs(["origin/HEAD", "origin/main"])).toBe(true);
  });

  it("should return false for undefined", () => {
    expect(hasRefs(undefined)).toBe(false);
  });

  it("should return false for empty array", () => {
    expect(hasRefs([])).toBe(false);
  });
});
