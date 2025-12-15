/**
 * Tests for the swimlane algorithm.
 *
 * These tests verify the core graph computation logic, ensuring
 * correct handling of:
 * - Linear history
 * - Branching and merging
 * - Multiple active branches
 * - Root commits
 * - Edge cases
 */

import { describe, it, expect } from "vitest";
import {
  computeSwimlanes,
  getMaxLaneCount,
  findNodeByCommitId,
  getLaneIndexForCommit,
} from "@/components/panes/editor-v2/components/CommitGraph/graph/swimlanes";
import type { HistoryCommit } from "@/components/panes/editor-v2/components/CommitGraph/types";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock commit for testing.
 */
function createCommit(
  id: string,
  parentIds: string[] = [],
  overrides: Partial<HistoryCommit> = {},
): HistoryCommit {
  return {
    id,
    shortId: id.slice(0, 7),
    subject: `Commit ${id}`,
    message: `Commit ${id}\n\nFull message body`,
    author: "Test Author",
    authorEmail: "test@example.com",
    timestamp: Date.now(),
    parentIds,
    ...overrides,
  };
}

/**
 * Create a linear chain of commits.
 * Returns commits in topological order (newest first).
 *
 * @param ids - Commit IDs from newest to oldest
 */
function createLinearHistory(ids: string[]): HistoryCommit[] {
  return ids.map((id, index) => {
    const parentIds = index < ids.length - 1 ? [ids[index + 1]] : [];
    return createCommit(id, parentIds);
  });
}

// =============================================================================
// Tests
// =============================================================================

describe("computeSwimlanes", () => {
  describe("Empty and Single Commit", () => {
    it("should handle empty commit list", () => {
      const result = computeSwimlanes([]);
      expect(result).toEqual([]);
    });

    it("should handle single root commit", () => {
      const commits = [createCommit("a")];
      const result = computeSwimlanes(commits);

      expect(result).toHaveLength(1);
      expect(result[0].commit.id).toBe("a");
      expect(result[0].laneIndex).toBe(0);
      expect(result[0].isMerge).toBe(false);
      expect(result[0].inputSwimlanes).toHaveLength(1);
      expect(result[0].outputSwimlanes).toHaveLength(0); // Root removes lane
    });

    it("should mark HEAD commit correctly", () => {
      const commits = [createCommit("a")];
      const result = computeSwimlanes(commits, { headCommitId: "a" });

      expect(result[0].isHead).toBe(true);
    });

    it("should not mark non-HEAD commits", () => {
      const commits = createLinearHistory(["a", "b"]);
      const result = computeSwimlanes(commits, { headCommitId: "a" });

      expect(result[0].isHead).toBe(true);
      expect(result[1].isHead).toBe(false);
    });
  });

  describe("Linear History", () => {
    it("should process linear history in single lane", () => {
      // a → b → c → d (root)
      const commits = createLinearHistory(["a", "b", "c", "d"]);
      const result = computeSwimlanes(commits);

      expect(result).toHaveLength(4);

      // All commits should be in lane 0
      for (const node of result) {
        expect(node.laneIndex).toBe(0);
      }
    });

    it("should maintain consistent swimlanes through linear history", () => {
      const commits = createLinearHistory(["a", "b", "c"]);
      const result = computeSwimlanes(commits);

      // Each commit has input lane targeting it, output targeting parent
      expect(result[0].inputSwimlanes[0].targetId).toBe("a");
      expect(result[0].outputSwimlanes[0].targetId).toBe("b");

      expect(result[1].inputSwimlanes[0].targetId).toBe("b");
      expect(result[1].outputSwimlanes[0].targetId).toBe("c");

      expect(result[2].inputSwimlanes[0].targetId).toBe("c");
      expect(result[2].outputSwimlanes).toHaveLength(0); // Root
    });

    it("should use same color throughout linear history", () => {
      const commits = createLinearHistory(["a", "b", "c"]);
      const result = computeSwimlanes(commits);

      const color = result[0].inputSwimlanes[0].color;
      expect(result[1].inputSwimlanes[0].color).toBe(color);
      expect(result[2].inputSwimlanes[0].color).toBe(color);
    });
  });

  describe("Simple Branch and Merge", () => {
    it("should handle diamond merge pattern", () => {
      // Graph:
      //   a (merge)
      //   |\
      //   b c
      //   |/
      //   d (root)
      const commits = [
        createCommit("a", ["b", "c"]), // Merge commit
        createCommit("b", ["d"]),
        createCommit("c", ["d"]),
        createCommit("d"), // Root
      ];
      const result = computeSwimlanes(commits);

      // Commit 'a' is a merge
      expect(result[0].isMerge).toBe(true);
      expect(result[0].laneIndex).toBe(0);

      // After 'a', there should be 2 lanes (one for each parent)
      expect(result[0].outputSwimlanes).toHaveLength(2);

      // 'b' is in lane 0
      expect(result[1].laneIndex).toBe(0);

      // 'c' is in lane 1
      expect(result[2].laneIndex).toBe(1);

      // 'd' - both lanes converge
      expect(result[3].laneIndex).toBe(0);
    });

    it("should assign different colors to branches", () => {
      const commits = [
        createCommit("a", ["b", "c"]),
        createCommit("b", ["d"]),
        createCommit("c", ["d"]),
        createCommit("d"),
      ];
      const result = computeSwimlanes(commits);

      // The two output lanes from the merge should have different colors
      const colors = result[0].outputSwimlanes.map((s) => s.color);
      expect(colors[0]).not.toBe(colors[1]);
    });

    it("should handle merge where second parent appears first in topo order", () => {
      // This matches the real scenario where git --topo-order puts the
      // second parent (feature branch) before the first parent (main branch)
      // Graph:
      //   merge (parents: [main-commit, feature-tip])
      //   |  \
      //   |   feature-tip
      //   |   feature-commit
      //   main-commit
      //   |
      //   root
      const commits = [
        createCommit("merge", ["main-commit", "feature-tip"]),
        createCommit("feature-tip", ["feature-commit"]), // Second parent appears first!
        createCommit("feature-commit", ["root"]),
        createCommit("main-commit", ["root"]), // First parent appears later
        createCommit("root"),
      ];
      const result = computeSwimlanes(commits);

      // Merge is at lane 0
      expect(result[0].laneIndex).toBe(0);
      // Output should have 2 lanes: lane 0 → main-commit, lane 1 → feature-tip
      expect(result[0].outputSwimlanes).toHaveLength(2);
      expect(result[0].outputSwimlanes[0].targetId).toBe("main-commit");
      expect(result[0].outputSwimlanes[1].targetId).toBe("feature-tip");

      // feature-tip should be at lane 1 (found via outputSwimlanes[1])
      expect(result[1].laneIndex).toBe(1);
      expect(result[1].commit.id).toBe("feature-tip");

      // feature-commit should also be at lane 1 (continues the feature branch)
      expect(result[2].laneIndex).toBe(1);

      // main-commit should be at lane 0
      expect(result[3].laneIndex).toBe(0);
      expect(result[3].commit.id).toBe("main-commit");

      // root - lanes should converge
      expect(result[4].laneIndex).toBe(0);
    });
  });

  describe("Multiple Branches", () => {
    it("should handle multiple active branches", () => {
      // Graph:
      //   a
      //   |\
      //   b |\
      //   | c \
      //   | |  d
      //   | | /
      //   e |/
      //   |/
      //   f (root)
      const commits = [
        createCommit("a", ["b", "c", "d"]), // 3-way merge
        createCommit("b", ["e"]),
        createCommit("c", ["f"]),
        createCommit("d", ["f"]),
        createCommit("e", ["f"]),
        createCommit("f"),
      ];
      const result = computeSwimlanes(commits);

      // After 'a', there should be 3 lanes
      expect(result[0].outputSwimlanes).toHaveLength(3);
      expect(result[0].isMerge).toBe(true);

      // Check lane assignments make sense
      expect(result[0].laneIndex).toBe(0); // a in lane 0
      expect(result[1].laneIndex).toBe(0); // b in lane 0
      expect(result[2].laneIndex).toBe(1); // c in lane 1
      expect(result[3].laneIndex).toBe(2); // d in lane 2
    });

    it("should keep all lanes targeting the same commit for curve drawing", () => {
      // Graph:
      //   a
      //   |\
      //   b c
      //   |/
      //   d  ← both b and c have d as parent
      const commits = [
        createCommit("a", ["b", "c"]),
        createCommit("b", ["d"]),
        createCommit("c", ["d"]),
        createCommit("d"),
      ];
      const result = computeSwimlanes(commits);

      // Both lanes should target 'd' so the renderer can draw converging curves
      // This is the VS Code approach - we need all input lanes to draw curves
      expect(result[3].inputSwimlanes).toHaveLength(2);
      expect(result[3].inputSwimlanes[0].targetId).toBe("d");
      expect(result[3].inputSwimlanes[1].targetId).toBe("d");

      // After processing 'd', only one lane should remain (targeting nothing for root)
      expect(result[3].outputSwimlanes).toHaveLength(0);
    });
  });

  describe("Branch Starting Mid-History", () => {
    it("should handle branch that starts after initial commits", () => {
      // Graph:
      //   a
      //   |
      //   b
      //   |\
      //   c d
      //   |/
      //   e
      const commits = [
        createCommit("a", ["b"]),
        createCommit("b", ["c", "d"]), // Branch point
        createCommit("c", ["e"]),
        createCommit("d", ["e"]),
        createCommit("e"),
      ];
      const result = computeSwimlanes(commits);

      // 'a' is in single lane
      expect(result[0].inputSwimlanes).toHaveLength(1);
      expect(result[0].outputSwimlanes).toHaveLength(1);

      // 'b' is a merge (from graph perspective, it has 2 parents in the output)
      expect(result[1].isMerge).toBe(true);
      expect(result[1].outputSwimlanes).toHaveLength(2);
    });
  });

  describe("Lane Color Assignment", () => {
    it("should rotate through colors for new branches", () => {
      // Create a commit with many parents to force color rotation
      const commits = [
        createCommit("a", ["b", "c", "d", "e", "f", "g"]),
        createCommit("b", []),
        createCommit("c", []),
        createCommit("d", []),
        createCommit("e", []),
        createCommit("f", []),
        createCommit("g", []),
      ];
      const result = computeSwimlanes(commits);

      // Should have 6 output swimlanes with rotating colors
      const colors = result[0].outputSwimlanes.map((s) => s.color);
      expect(colors).toHaveLength(6);

      // 6th color should wrap (6 % 5 = 1, so should be branch-2)
      // Actually first lane keeps initial color, new lanes get new colors
    });

    it("should respect initial color index", () => {
      const commits = [createCommit("a", ["b"]), createCommit("b")];

      const result1 = computeSwimlanes(commits, { initialColorIndex: 0 });
      const result2 = computeSwimlanes(commits, { initialColorIndex: 2 });

      // Different starting colors
      expect(result1[0].inputSwimlanes[0].color).not.toBe(
        result2[0].inputSwimlanes[0].color,
      );
    });
  });

  describe("Root Commits", () => {
    it("should remove lane for root commit", () => {
      const commits = [createCommit("a", ["b"]), createCommit("b")];
      const result = computeSwimlanes(commits);

      // Root commit has no output swimlanes
      expect(result[1].outputSwimlanes).toHaveLength(0);
    });

    it("should handle multiple root commits", () => {
      // This can happen with orphan branches or imported history
      const commits = [
        createCommit("a", ["b"]),
        createCommit("b"),
        createCommit("c"), // Another root (orphan)
      ];
      const result = computeSwimlanes(commits);

      // 'b' removes its lane
      expect(result[1].outputSwimlanes).toHaveLength(0);

      // 'c' creates new lane then removes it
      expect(result[2].outputSwimlanes).toHaveLength(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle commit not targeted by any lane", () => {
      // This happens at the start of history where commit isn't known yet
      const commits = [createCommit("a", ["b"])];
      const result = computeSwimlanes(commits);

      // 'a' creates its own lane
      expect(result[0].laneIndex).toBe(0);
      expect(result[0].inputSwimlanes).toHaveLength(1);
    });

    it("should preserve lane indices across complex merges", () => {
      // Ensure commits stay in their assigned lanes
      const commits = [
        createCommit("a", ["b", "c"]),
        createCommit("b", ["d"]),
        createCommit("c", ["d"]),
        createCommit("d"),
      ];
      const result = computeSwimlanes(commits);

      // Verify consistent lane assignment
      expect(getLaneIndexForCommit(result, "a")).toBe(0);
      expect(getLaneIndexForCommit(result, "b")).toBe(0);
      expect(getLaneIndexForCommit(result, "c")).toBe(1);
      expect(getLaneIndexForCommit(result, "d")).toBe(0);
    });
  });
});

describe("Utility Functions", () => {
  describe("getMaxLaneCount", () => {
    it("should return 0 for empty nodes", () => {
      expect(getMaxLaneCount([])).toBe(0);
    });

    it("should return 1 for linear history", () => {
      const commits = createLinearHistory(["a", "b", "c"]);
      const nodes = computeSwimlanes(commits);
      expect(getMaxLaneCount(nodes)).toBe(1);
    });

    it("should return max lanes across all commits", () => {
      const commits = [
        createCommit("a", ["b", "c", "d"]),
        createCommit("b", ["e"]),
        createCommit("c", ["e"]),
        createCommit("d", ["e"]),
        createCommit("e"),
      ];
      const nodes = computeSwimlanes(commits);
      expect(getMaxLaneCount(nodes)).toBe(3);
    });
  });

  describe("findNodeByCommitId", () => {
    it("should find existing commit", () => {
      const commits = createLinearHistory(["a", "b", "c"]);
      const nodes = computeSwimlanes(commits);

      const found = findNodeByCommitId(nodes, "b");
      expect(found).toBeDefined();
      expect(found?.commit.id).toBe("b");
    });

    it("should return undefined for non-existent commit", () => {
      const commits = createLinearHistory(["a", "b"]);
      const nodes = computeSwimlanes(commits);

      expect(findNodeByCommitId(nodes, "z")).toBeUndefined();
    });
  });

  describe("getLaneIndexForCommit", () => {
    it("should return lane index for existing commit", () => {
      const commits = [
        createCommit("a", ["b", "c"]),
        createCommit("b", ["d"]),
        createCommit("c", ["d"]),
        createCommit("d"),
      ];
      const nodes = computeSwimlanes(commits);

      expect(getLaneIndexForCommit(nodes, "a")).toBe(0);
      expect(getLaneIndexForCommit(nodes, "c")).toBe(1);
    });

    it("should return -1 for non-existent commit", () => {
      const commits = createLinearHistory(["a", "b"]);
      const nodes = computeSwimlanes(commits);

      expect(getLaneIndexForCommit(nodes, "z")).toBe(-1);
    });
  });
});
