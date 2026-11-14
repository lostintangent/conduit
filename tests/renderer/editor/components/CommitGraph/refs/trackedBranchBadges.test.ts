/**
 * Tests for the tracked branch badge building utilities.
 *
 * These tests verify the shared logic for building colored badges
 * based on tracked branch relationships.
 */

import { describe, it, expect } from "vitest";
import {
  buildTrackedBranchBadges,
  isSameBranch,
} from "@/components/panes/editor/components/CommitGraph/refs/trackedBranchBadges";
import type { TrackedBranchInfo } from "@features/git/model";
import { trackedBranch } from "../fixtures";

// =============================================================================
// isSameBranch Tests
// =============================================================================

describe("isSameBranch", () => {
  it("should return true for identical branches", () => {
    const a = { remote: "origin", displayName: "origin/main" };
    const b = { remote: "origin", displayName: "origin/main" };
    expect(isSameBranch(a, b)).toBe(true);
  });

  it("should return false for different branch names", () => {
    const a = { remote: "origin", displayName: "origin/main" };
    const b = { remote: "origin", displayName: "origin/feature" };
    expect(isSameBranch(a, b)).toBe(false);
  });

  it("should return false for different remotes", () => {
    const a = { remote: "origin", displayName: "origin/main" };
    const b = { remote: "upstream", displayName: "upstream/main" };
    expect(isSameBranch(a, b)).toBe(false);
  });

  it("should return false when first arg is null", () => {
    const b = { remote: "origin", displayName: "origin/main" };
    expect(isSameBranch(null, b)).toBe(false);
  });

  it("should return false when second arg is null", () => {
    const a = { remote: "origin", displayName: "origin/main" };
    expect(isSameBranch(a, null)).toBe(false);
  });

  it("should return false when both args are null", () => {
    expect(isSameBranch(null, null)).toBe(false);
  });

  it("should handle undefined remote", () => {
    const a = { displayName: "main" };
    const b = { displayName: "main" };
    expect(isSameBranch(a, b)).toBe(true);
  });
});

// =============================================================================
// buildTrackedBranchBadges Tests
// =============================================================================

describe("buildTrackedBranchBadges", () => {
  const headCommitId = "abc123";
  const upstreamCommitId = "def456";
  const baseCommitId = "ghi789";

  describe("when trackedBranches is null/undefined", () => {
    it("should return empty array when null", () => {
      const result = buildTrackedBranchBadges(headCommitId, true, null);
      expect(result).toEqual([]);
    });

    it("should return empty array when undefined", () => {
      const result = buildTrackedBranchBadges(headCommitId, true, undefined);
      expect(result).toEqual([]);
    });
  });

  describe("current branch badge", () => {
    it("should show current badge on HEAD commit", () => {
      const trackedBranches: TrackedBranchInfo = {
        current: trackedBranch("current", "feature-branch", headCommitId),
        upstream: null,
        base: null,
      };

      const result = buildTrackedBranchBadges(
        headCommitId,
        true,
        trackedBranches,
      );

      expect(result).toHaveLength(1);
      expect(result[0].colorHint).toBe("current");
      expect(result[0].ref.name).toBe("feature-branch");
      expect(result[0].ref.type).toBe("head");
    });

    it("should not show current badge when not HEAD", () => {
      const trackedBranches: TrackedBranchInfo = {
        current: trackedBranch("current", "feature-branch", headCommitId),
        upstream: null,
        base: null,
      };

      const result = buildTrackedBranchBadges(
        headCommitId,
        false,
        trackedBranches,
      );

      expect(result).toHaveLength(0);
    });
  });

  describe("upstream branch badge", () => {
    it("should show upstream badge on commit it points to", () => {
      const trackedBranches: TrackedBranchInfo = {
        current: trackedBranch("current", "feature", headCommitId),
        upstream: trackedBranch("upstream", "origin/feature", upstreamCommitId),
        base: null,
      };

      const result = buildTrackedBranchBadges(
        upstreamCommitId,
        false,
        trackedBranches,
      );

      expect(result).toHaveLength(1);
      expect(result[0].colorHint).toBe("upstream");
      expect(result[0].ref.type).toBe("remote");
    });

    it("should not show upstream badge on different commit", () => {
      const trackedBranches: TrackedBranchInfo = {
        current: trackedBranch("current", "feature", headCommitId),
        upstream: trackedBranch("upstream", "origin/feature", upstreamCommitId),
        base: null,
      };

      const result = buildTrackedBranchBadges(
        "different-commit",
        false,
        trackedBranches,
      );

      expect(result).toHaveLength(0);
    });
  });

  describe("base branch badge", () => {
    it("should show base badge on commit it points to", () => {
      const trackedBranches: TrackedBranchInfo = {
        current: trackedBranch("current", "feature", headCommitId),
        upstream: trackedBranch("upstream", "origin/feature", upstreamCommitId),
        base: trackedBranch("base", "origin/main", baseCommitId),
      };

      const result = buildTrackedBranchBadges(
        baseCommitId,
        false,
        trackedBranches,
      );

      expect(result).toHaveLength(1);
      expect(result[0].colorHint).toBe("base");
    });

    it("should hide base badge when same as upstream (VS Code style)", () => {
      const sameCommitId = "same123";
      const trackedBranches: TrackedBranchInfo = {
        current: trackedBranch("current", "main", headCommitId),
        upstream: trackedBranch("upstream", "origin/main", sameCommitId),
        base: trackedBranch("base", "origin/main", sameCommitId),
      };

      // On the shared commit, only upstream should show, not base
      const result = buildTrackedBranchBadges(
        sameCommitId,
        false,
        trackedBranches,
      );

      expect(result).toHaveLength(1);
      expect(result[0].colorHint).toBe("upstream");
    });
  });

  describe("iconOnly option", () => {
    it("should not use iconOnly by default", () => {
      const trackedBranches: TrackedBranchInfo = {
        current: trackedBranch("current", "feature", headCommitId),
        upstream: trackedBranch("upstream", "origin/feature", headCommitId),
        base: null,
      };

      const result = buildTrackedBranchBadges(
        headCommitId,
        true,
        trackedBranches,
      );

      expect(result).toHaveLength(2);
      expect(result[0].iconOnly).toBeUndefined();
      expect(result[1].iconOnly).toBeFalsy();
    });

    it("should use iconOnly for subsequent badges when enabled", () => {
      const trackedBranches: TrackedBranchInfo = {
        current: trackedBranch("current", "feature", headCommitId),
        upstream: trackedBranch("upstream", "origin/feature", headCommitId),
        base: null,
      };

      const result = buildTrackedBranchBadges(
        headCommitId,
        true,
        trackedBranches,
        { useIconOnly: true },
      );

      expect(result).toHaveLength(2);
      expect(result[0].iconOnly).toBeUndefined(); // First badge never icon-only
      expect(result[1].iconOnly).toBe(true); // Second badge is icon-only
    });
  });

  describe("multiple badges on same commit", () => {
    it("should show all relevant badges on HEAD", () => {
      const trackedBranches: TrackedBranchInfo = {
        current: trackedBranch("current", "feature", headCommitId),
        upstream: trackedBranch("upstream", "origin/feature", headCommitId),
        base: trackedBranch("base", "origin/main", headCommitId),
      };

      const result = buildTrackedBranchBadges(
        headCommitId,
        true,
        trackedBranches,
      );

      expect(result).toHaveLength(3);
      expect(result[0].colorHint).toBe("current");
      expect(result[1].colorHint).toBe("upstream");
      expect(result[2].colorHint).toBe("base");
    });
  });
});
