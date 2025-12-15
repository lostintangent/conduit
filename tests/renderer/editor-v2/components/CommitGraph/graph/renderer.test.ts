/**
 * Tests for the graph renderer functions.
 *
 * These tests verify the SVG path and circle calculations
 * for the commit graph visualization.
 */

import { describe, it, expect } from "vitest";
import {
  laneX,
  rowCenterY,
  verticalLinePath,
  curvePathBetweenLanes,
  pathFromAbove,
  pathToBelow,
  passThroughPath,
  getPassThroughLanes,
  findCommitInputLane,
  calculateCircle,
  calculateGraphCell,
  calculateGraphWidth,
} from "@/components/panes/editor-v2/components/CommitGraph/graph/renderer";
import type {
  CommitGraphNode,
  GraphRenderConfig,
  Swimlane,
  HistoryCommit,
} from "@/components/panes/editor-v2/components/CommitGraph/types";

// =============================================================================
// Test Helpers
// =============================================================================

const defaultConfig: GraphRenderConfig = {
  laneWidth: 16,
  rowHeight: 44,
  circleRadius: 5,
  curveRadius: 6,
  strokeWidth: 2,
  lineGap: 0,
};

function createCommit(id: string, parentIds: string[] = []): HistoryCommit {
  return {
    id,
    shortId: id.slice(0, 7),
    subject: `Commit ${id}`,
    message: `Commit ${id}`,
    author: "Test Author",
    authorEmail: "test@example.com",
    timestamp: Date.now(),
    parentIds,
  };
}

function createSwimlane(
  targetId: string,
  color: Swimlane["color"] = "branch-1",
): Swimlane {
  return { targetId, color };
}

function createNode(
  commit: HistoryCommit,
  laneIndex: number,
  inputSwimlanes: Swimlane[],
  outputSwimlanes: Swimlane[],
  options: { isMerge?: boolean; isHead?: boolean } = {},
): CommitGraphNode {
  return {
    commit,
    laneIndex,
    inputSwimlanes,
    outputSwimlanes,
    isMerge: options.isMerge ?? false,
    isHead: options.isHead ?? false,
  };
}

// =============================================================================
// Position Calculations
// =============================================================================

describe("laneX", () => {
  it("should calculate X position for lane 0", () => {
    expect(laneX(0, defaultConfig)).toBe(8); // laneWidth/2 = 16/2 = 8
  });

  it("should calculate X position for lane 1", () => {
    expect(laneX(1, defaultConfig)).toBe(24); // 8 + 16 = 24
  });

  it("should calculate X position for lane 2", () => {
    expect(laneX(2, defaultConfig)).toBe(40); // 8 + 32 = 40
  });

  it("should work with different lane widths", () => {
    const config = { ...defaultConfig, laneWidth: 20 };
    expect(laneX(0, config)).toBe(10);
    expect(laneX(1, config)).toBe(30);
    expect(laneX(2, config)).toBe(50);
  });
});

describe("rowCenterY", () => {
  it("should calculate center Y for standard row height", () => {
    expect(rowCenterY(44)).toBe(22);
  });

  it("should calculate center Y for expanded row", () => {
    expect(rowCenterY(200)).toBe(100);
  });

  it("should handle small heights", () => {
    expect(rowCenterY(20)).toBe(10);
  });
});

// =============================================================================
// SVG Path Generation
// =============================================================================

describe("verticalLinePath", () => {
  it("should generate vertical line path", () => {
    const path = verticalLinePath(8, 0, 44);
    expect(path).toBe("M 8 0 L 8 44");
  });

  it("should handle different coordinates", () => {
    const path = verticalLinePath(24, 10, 30);
    expect(path).toBe("M 24 10 L 24 30");
  });
});

describe("curvePathBetweenLanes", () => {
  it("should generate curve from left to right", () => {
    const path = curvePathBetweenLanes(0, 1, 0, 22, defaultConfig);
    // Should start at lane 0, end at lane 1
    expect(path).toContain("M 8 0");
    expect(path).toContain("Q");
    expect(path).toContain("24 22");
  });

  it("should generate curve from right to left", () => {
    const path = curvePathBetweenLanes(2, 0, 0, 22, defaultConfig);
    // Should start at lane 2, end at lane 0
    expect(path).toContain("M 40 0");
    expect(path).toContain("8 22");
  });
});

describe("pathFromAbove", () => {
  it("should generate straight path when same lane", () => {
    const path = pathFromAbove(0, 0, 22, defaultConfig);
    // Should be vertical line to just above circle
    expect(path).toBe("M 8 0 L 8 17"); // 22 - 5 (circle radius) = 17
  });

  it("should generate curve when different lanes (branch start from right)", () => {
    const path = pathFromAbove(1, 0, 22, defaultConfig);
    // Should curve from lane 1 (right, branch) to lane 0 (left, parent) - branch start case
    // Draws FROM the parent node's 3 o'clock position OUT to the branch lane
    // circleRightEdge = toX + circleRadius = 8 + 5 = 13
    // Path: starts at (13, 22) - node's 3 o'clock, curves to (24, 0) - branch lane at top
    expect(path).toContain("M 13 22"); // Start at node's 3 o'clock
    expect(path).toContain("Q 24 22 24 0"); // Bezier right then up to branch lane
  });

  it("should generate curve when different lanes (branch start from left)", () => {
    const path = pathFromAbove(0, 1, 22, defaultConfig);
    // Should curve from lane 0 (left) to lane 1 (right) - branch start case
    // Starts at "3 o'clock" position: fromX + circleRadius = 8 + 5 = 13
    // endY = 22 - 5 = 17
    expect(path).toContain("M 13 0"); // Start at 3 o'clock of source lane
    expect(path).toContain("Q 24 0 24 17"); // Bezier to target lane
  });
});

describe("pathToBelow", () => {
  it("should generate straight path when same lane", () => {
    const path = pathToBelow(0, 0, 22, 44, defaultConfig);
    // Should be vertical line from just below circle to bottom
    expect(path).toBe("M 8 27 L 8 44"); // 22 + 5 (circle radius) = 27
  });

  it("should generate curve when different lanes", () => {
    const path = pathToBelow(0, 1, 22, 44, defaultConfig);
    // VS Code style: arc at target lane + horizontal connector
    // arcStartX = toX - laneWidth/2 = 24 - 8 = 16 (left edge of lane 1)
    // toX = 24 (center of lane 1)
    // fromX = 8 (center of lane 0)
    // arcRadius = laneWidth = 16
    // Quadratic bezier from circle edge to target lane
    // circleRightEdge = 8 + 5 + 0 = 13, toX = 24, centerY = 22, height = 44
    expect(path).toContain("M 13 22"); // Starts at circle edge
    expect(path).toContain("Q 24 22 24 44"); // Bezier to target lane at bottom
  });
});

describe("passThroughPath", () => {
  it("should generate vertical pass-through path", () => {
    const path = passThroughPath(1, 44, defaultConfig);
    expect(path).toBe("M 24 0 L 24 44");
  });

  it("should work for different lanes", () => {
    const path = passThroughPath(2, 44, defaultConfig);
    expect(path).toBe("M 40 0 L 40 44");
  });
});

// =============================================================================
// Lane Analysis
// =============================================================================

describe("getPassThroughLanes", () => {
  it("should return empty array when no pass-through lanes", () => {
    const input = [createSwimlane("a")];
    const output = [createSwimlane("b")];
    const result = getPassThroughLanes(input, output, 0);
    expect(result).toEqual([]);
  });

  it("should identify pass-through lanes", () => {
    // Commit is in lane 0, but lane 1 passes through
    const input = [
      createSwimlane("a"), // lane 0 - commit's lane
      createSwimlane("c"), // lane 1 - passes through
    ];
    const output = [
      createSwimlane("b"), // lane 0 - now targeting parent
      createSwimlane("c"), // lane 1 - still targeting c
    ];
    const result = getPassThroughLanes(input, output, 0);
    expect(result).toEqual([1]);
  });

  it("should exclude commit lane from pass-through", () => {
    const input = [createSwimlane("a")];
    const output = [createSwimlane("a")]; // Same target but it's the commit lane
    const result = getPassThroughLanes(input, output, 0);
    expect(result).toEqual([]);
  });

  it("should handle multiple pass-through lanes", () => {
    const input = [
      createSwimlane("a"), // lane 0 - commit
      createSwimlane("x"), // lane 1 - passes through
      createSwimlane("y"), // lane 2 - passes through
    ];
    const output = [
      createSwimlane("b"), // lane 0 - targeting parent
      createSwimlane("x"), // lane 1 - still there
      createSwimlane("y"), // lane 2 - still there
    ];
    const result = getPassThroughLanes(input, output, 0);
    expect(result).toEqual([1, 2]);
  });
});

describe("findCommitInputLane", () => {
  it("should find lane targeting commit", () => {
    const input = [
      createSwimlane("other"),
      createSwimlane("target"),
      createSwimlane("another"),
    ];
    expect(findCommitInputLane(input, "target")).toBe(1);
  });

  it("should return -1 when not found", () => {
    const input = [createSwimlane("a"), createSwimlane("b")];
    expect(findCommitInputLane(input, "missing")).toBe(-1);
  });

  it("should return first match if duplicates", () => {
    const input = [createSwimlane("target"), createSwimlane("target")];
    expect(findCommitInputLane(input, "target")).toBe(0);
  });
});

// =============================================================================
// Circle Calculation
// =============================================================================

describe("calculateCircle", () => {
  it("should calculate circle for normal commit", () => {
    const commit = createCommit("a", ["b"]);
    const node = createNode(
      commit,
      0,
      [createSwimlane("a")],
      [createSwimlane("b")],
    );

    const circle = calculateCircle(node, 44, defaultConfig);

    expect(circle.cx).toBe(8); // lane 0 x position
    expect(circle.cy).toBe(12); // always at ROW_HEIGHT / 2 = 24 / 2
    expect(circle.r).toBe(5);
    expect(circle.style).toBe("normal");
    expect(circle.color).toBe("branch-1");
  });

  it("should set head style for HEAD commit", () => {
    const commit = createCommit("a", ["b"]);
    const node = createNode(
      commit,
      0,
      [createSwimlane("a")],
      [createSwimlane("b")],
      { isHead: true },
    );

    const circle = calculateCircle(node, 44, defaultConfig);
    expect(circle.style).toBe("head");
  });

  it("should set merge style for merge commit", () => {
    const commit = createCommit("a", ["b", "c"]);
    const node = createNode(
      commit,
      0,
      [createSwimlane("a")],
      [createSwimlane("b"), createSwimlane("c")],
      { isMerge: true },
    );

    const circle = calculateCircle(node, 44, defaultConfig);
    expect(circle.style).toBe("merge");
  });

  it("should prefer head style over merge style", () => {
    const commit = createCommit("a", ["b", "c"]);
    const node = createNode(
      commit,
      0,
      [createSwimlane("a")],
      [createSwimlane("b"), createSwimlane("c")],
      { isMerge: true, isHead: true },
    );

    const circle = calculateCircle(node, 44, defaultConfig);
    expect(circle.style).toBe("head");
  });

  it("should use color from input swimlane", () => {
    const commit = createCommit("a", ["b"]);
    const node = createNode(
      commit,
      0,
      [createSwimlane("a", "branch-3")],
      [createSwimlane("b")],
    );

    const circle = calculateCircle(node, 44, defaultConfig);
    expect(circle.color).toBe("branch-3");
  });

  it("should calculate correct position for non-zero lane", () => {
    const commit = createCommit("a", ["b"]);
    const node = createNode(
      commit,
      2, // lane index 2
      [createSwimlane("x"), createSwimlane("y"), createSwimlane("a")],
      [createSwimlane("b")],
    );

    const circle = calculateCircle(node, 44, defaultConfig);
    expect(circle.cx).toBe(40); // lane 2 x position
  });
});

// =============================================================================
// Complete Cell Calculation
// =============================================================================

describe("calculateGraphCell", () => {
  it("should calculate cell for simple linear commit", () => {
    const commit = createCommit("a", ["b"]);
    const node = createNode(
      commit,
      0,
      [createSwimlane("a")],
      [createSwimlane("b")],
    );

    const cell = calculateGraphCell(node, 44, defaultConfig);

    expect(cell.width).toBe(16); // 1 lane
    expect(cell.height).toBe(44);
    expect(cell.paths.length).toBe(2); // incoming + outgoing
    expect(cell.circle).toBeDefined();
    expect(cell.circle.style).toBe("normal");
  });

  it("should calculate cell for merge commit", () => {
    const commit = createCommit("a", ["b", "c"]);
    const node = createNode(
      commit,
      0,
      [createSwimlane("a")],
      [createSwimlane("b"), createSwimlane("c", "branch-2")],
      { isMerge: true },
    );

    const cell = calculateGraphCell(node, 44, defaultConfig);

    expect(cell.width).toBe(32); // 2 lanes
    // Should have: incoming + 2 outgoing
    expect(cell.paths.length).toBeGreaterThanOrEqual(2);
    expect(cell.circle.style).toBe("merge");
  });

  it("should generate curve path to second parent in merge commit", () => {
    // This test specifically verifies that merge commits draw a curve
    // to their second parent (e.g., the feature branch being merged in)
    const commit = createCommit("merge", ["first-parent", "second-parent"]);
    const node = createNode(
      commit,
      0, // Merge is at lane 0
      [createSwimlane("merge")],
      [
        createSwimlane("first-parent"), // Lane 0 targets first parent
        createSwimlane("second-parent", "branch-2"), // Lane 1 targets second parent
      ],
      { isMerge: true },
    );

    const cell = calculateGraphCell(node, 44, defaultConfig);

    // Should have 3 paths: incoming + straight down to first parent + curve to second parent
    expect(cell.paths.length).toBe(3);

    // Find the curve path (to lane 1) - bezier curve (Q command)
    // Lane 0 x = 8, Lane 1 x = 24
    const curvePath = cell.paths.find(
      (p) => p.d.includes("Q") && p.d.includes("24"),
    );
    expect(curvePath).toBeDefined();
    expect(curvePath!.color).toBe("branch-2");
    expect(curvePath!.isPassThrough).toBe(false);

    // Quadratic bezier from circle edge directly to target lane
    // circleRightEdge = 8 + 5 + 0 = 13, toX = 24, centerY = 12 (ROW_HEIGHT/2), height = 44
    expect(curvePath!.d).toContain("M 13"); // Starts at circle edge
    expect(curvePath!.d).toContain("Q 24"); // Bezier control point at target lane
  });

  it("should draw incoming curves for ALL lanes targeting this commit", () => {
    // This is the key scenario for branch convergence:
    // Multiple branches (lanes) all target the same commit (branch point)
    // We need to draw incoming curves for ALL of them, not just the first one
    const commit = createCommit("branch-point", ["root"]);
    const node = createNode(
      commit,
      0, // Branch point is at lane 0
      [
        createSwimlane("branch-point"), // Lane 0 - main lane targeting this commit
        createSwimlane("branch-point", "branch-2"), // Lane 1 - another branch also targets this
        createSwimlane("branch-point", "branch-3"), // Lane 2 - third branch also targets this
      ],
      [createSwimlane("root")], // After processing, only one lane remains
    );

    const cell = calculateGraphCell(node, 44, defaultConfig);

    // Should have:
    // - 1 straight incoming line (from lane 0)
    // - 2 curved incoming lines (from lanes 1 and 2)
    // - 1 outgoing line (to root)
    const incomingPaths = cell.paths.filter(
      (p) => !p.isPassThrough && p.d.startsWith("M") && !p.d.includes("H"),
    );
    // We expect at least 3 incoming paths (lanes 0, 1, 2 all target this commit)
    // Plus the outgoing path
    expect(cell.paths.length).toBeGreaterThanOrEqual(4);

    // Verify curves exist from lanes 1 and 2 (branch convergence)
    // These are the "branch start" indicators drawn at the parent commit
    const curvesFromAbove = cell.paths.filter(
      (p) => p.d.includes("Q") && p.d.includes("0"), // Quadratic curves going to lane 0
    );
    expect(curvesFromAbove.length).toBe(2); // One from lane 1, one from lane 2
  });

  it("should include pass-through paths", () => {
    const commit = createCommit("a", ["b"]);
    const node = createNode(
      commit,
      0,
      [
        createSwimlane("a"),
        createSwimlane("x", "branch-2"), // passes through
      ],
      [
        createSwimlane("b"),
        createSwimlane("x", "branch-2"), // still there
      ],
    );

    const cell = calculateGraphCell(node, 44, defaultConfig);

    // Should have pass-through path
    const passThroughPaths = cell.paths.filter((p) => p.isPassThrough);
    expect(passThroughPaths.length).toBe(1);
    expect(passThroughPaths[0].color).toBe("branch-2");
  });

  it("should calculate correct width for multiple lanes", () => {
    const commit = createCommit("a", ["b", "c", "d"]);
    const node = createNode(
      commit,
      0,
      [createSwimlane("a")],
      [createSwimlane("b"), createSwimlane("c"), createSwimlane("d")],
    );

    const cell = calculateGraphCell(node, 44, defaultConfig);
    expect(cell.width).toBe(48); // 3 lanes * 16
  });

  it("should handle expanded row height", () => {
    const commit = createCommit("a", ["b"]);
    const node = createNode(
      commit,
      0,
      [createSwimlane("a")],
      [createSwimlane("b")],
    );

    const cell = calculateGraphCell(node, 200, defaultConfig);

    expect(cell.height).toBe(200);
    expect(cell.circle.cy).toBe(12); // always at ROW_HEIGHT / 2 = 24 / 2, not expanded center
  });

  it("should handle root commit (no output)", () => {
    const commit = createCommit("a", []); // no parents
    const node = createNode(
      commit,
      0,
      [createSwimlane("a")],
      [], // no output lanes
    );

    const cell = calculateGraphCell(node, 44, defaultConfig);

    // Should only have incoming path, no outgoing
    expect(cell.paths.length).toBe(1);
  });

  it("should handle commit not in input (orphan start)", () => {
    const commit = createCommit("a", ["b"]);
    const node = createNode(
      commit,
      0,
      [], // no input (start of new branch in view)
      [createSwimlane("b")],
    );

    const cell = calculateGraphCell(node, 44, defaultConfig);

    // Should have outgoing but no incoming
    expect(cell.paths.some((p) => !p.isPassThrough)).toBe(true);
  });
});

// =============================================================================
// Utility Functions
// =============================================================================

describe("calculateGraphWidth", () => {
  it("should return minimum width for empty nodes", () => {
    expect(calculateGraphWidth([], defaultConfig)).toBe(16);
  });

  it("should calculate width from max lanes", () => {
    const nodes = [
      createNode(
        createCommit("a", ["b"]),
        0,
        [createSwimlane("a")],
        [createSwimlane("b")],
      ),
      createNode(
        createCommit("b", ["c", "d", "e"]),
        0,
        [createSwimlane("b")],
        [createSwimlane("c"), createSwimlane("d"), createSwimlane("e")],
      ),
    ];

    const width = calculateGraphWidth(nodes, defaultConfig);
    expect(width).toBe(48); // 3 lanes * 16
  });

  it("should use input or output lanes for max", () => {
    const nodes = [
      createNode(
        createCommit("a", ["b"]),
        0,
        [
          createSwimlane("a"),
          createSwimlane("x"),
          createSwimlane("y"),
          createSwimlane("z"),
        ], // 4 input lanes
        [createSwimlane("b")], // 1 output lane
      ),
    ];

    const width = calculateGraphWidth(nodes, defaultConfig);
    expect(width).toBe(64); // 4 lanes * 16
  });
});
