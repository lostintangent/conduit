/**
 * Tests for the GraphCell component.
 *
 * These tests verify the SVG rendering of the commit graph visualization.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GraphCell } from "@/components/panes/editor-v2/components/CommitGraph/graph/GraphCell";
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
    segmentType: null,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("GraphCell", () => {
  describe("SVG Structure", () => {
    it("should render an SVG element", () => {
      const commit = createCommit("a", ["b"]);
      const node = createNode(
        commit,
        0,
        [createSwimlane("a")],
        [createSwimlane("b")],
      );

      const { container } = render(
        <GraphCell node={node} height={44} config={defaultConfig} />,
      );

      const svg = container.querySelector("svg");
      expect(svg).toBeTruthy();
    });

    it("should set correct SVG dimensions", () => {
      const commit = createCommit("a", ["b"]);
      const node = createNode(
        commit,
        0,
        [createSwimlane("a")],
        [createSwimlane("b")],
      );

      const { container } = render(
        <GraphCell node={node} height={44} config={defaultConfig} />,
      );

      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("width")).toBe("16");
      expect(svg?.getAttribute("height")).toBe("44");
    });

    it("should render with aria-hidden for accessibility", () => {
      const commit = createCommit("a", ["b"]);
      const node = createNode(
        commit,
        0,
        [createSwimlane("a")],
        [createSwimlane("b")],
      );

      const { container } = render(
        <GraphCell node={node} height={44} config={defaultConfig} />,
      );

      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
    });

    it("should apply custom className", () => {
      const commit = createCommit("a", ["b"]);
      const node = createNode(
        commit,
        0,
        [createSwimlane("a")],
        [createSwimlane("b")],
      );

      const { container } = render(
        <GraphCell
          node={node}
          height={44}
          config={defaultConfig}
          className="custom-class"
        />,
      );

      const svg = container.querySelector("svg");
      expect(svg?.classList.contains("custom-class")).toBe(true);
    });
  });

  describe("Path Rendering", () => {
    it("should render path elements", () => {
      const commit = createCommit("a", ["b"]);
      const node = createNode(
        commit,
        0,
        [createSwimlane("a")],
        [createSwimlane("b")],
      );

      const { container } = render(
        <GraphCell node={node} height={44} config={defaultConfig} />,
      );

      const paths = container.querySelectorAll("path");
      expect(paths.length).toBeGreaterThan(0);
    });

    it("should set stroke properties on paths", () => {
      const commit = createCommit("a", ["b"]);
      const node = createNode(
        commit,
        0,
        [createSwimlane("a")],
        [createSwimlane("b")],
      );

      const { container } = render(
        <GraphCell node={node} height={44} config={defaultConfig} />,
      );

      const path = container.querySelector("path");
      expect(path?.getAttribute("stroke")).toBeTruthy();
      expect(path?.getAttribute("stroke-width")).toBe("2");
      expect(path?.getAttribute("fill")).toBe("none");
    });

    it("should render pass-through paths", () => {
      const commit = createCommit("a", ["b"]);
      const node = createNode(
        commit,
        0,
        [
          createSwimlane("a"),
          createSwimlane("x", "branch-2"), // passes through
        ],
        [createSwimlane("b"), createSwimlane("x", "branch-2")],
      );

      const { container } = render(
        <GraphCell node={node} height={44} config={defaultConfig} />,
      );

      // Should have multiple paths (including pass-through)
      const paths = container.querySelectorAll("path");
      expect(paths.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Circle Rendering", () => {
    it("should render a circle element for normal commit", () => {
      const commit = createCommit("a", ["b"]);
      const node = createNode(
        commit,
        0,
        [createSwimlane("a")],
        [createSwimlane("b")],
      );

      const { container } = render(
        <GraphCell node={node} height={44} config={defaultConfig} />,
      );

      const circles = container.querySelectorAll("circle");
      expect(circles.length).toBe(1);
    });

    it("should render hollow circle for HEAD commit", () => {
      const commit = createCommit("a", ["b"]);
      const node = createNode(
        commit,
        0,
        [createSwimlane("a")],
        [createSwimlane("b")],
        { isHead: true },
      );

      const { container } = render(
        <GraphCell node={node} height={24} config={defaultConfig} />,
      );

      // HEAD commits have a single hollow circle (stroke only, no fill)
      const circles = container.querySelectorAll("circle");
      expect(circles.length).toBe(1);
      // Hollow circle has fill="none" and a stroke
      const circle = circles[0];
      expect(circle.getAttribute("fill")).toBe("none");
      expect(circle.getAttribute("stroke")).toBeTruthy();
    });

    it("should position circle at correct coordinates", () => {
      const commit = createCommit("a", ["b"]);
      const node = createNode(
        commit,
        1, // lane index 1
        [createSwimlane("x"), createSwimlane("a")],
        [createSwimlane("b")],
      );

      const { container } = render(
        <GraphCell node={node} height={44} config={defaultConfig} />,
      );

      const circle = container.querySelector("circle");
      expect(circle?.getAttribute("cx")).toBe("24"); // lane 1 x position
      expect(circle?.getAttribute("cy")).toBe("12"); // always at ROW_HEIGHT / 2 = 24 / 2
    });

    it("should use correct circle radius", () => {
      const commit = createCommit("a", ["b"]);
      const node = createNode(
        commit,
        0,
        [createSwimlane("a")],
        [createSwimlane("b")],
      );

      const { container } = render(
        <GraphCell node={node} height={44} config={defaultConfig} />,
      );

      const circle = container.querySelector("circle");
      expect(circle?.getAttribute("r")).toBe("5");
    });
  });

  describe("Height Handling", () => {
    it("should adjust SVG height for expanded rows", () => {
      const commit = createCommit("a", ["b"]);
      const node = createNode(
        commit,
        0,
        [createSwimlane("a")],
        [createSwimlane("b")],
      );

      const { container } = render(
        <GraphCell node={node} height={200} config={defaultConfig} />,
      );

      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("height")).toBe("200");
    });

    it("should keep circle at commit row level even when expanded", () => {
      const commit = createCommit("a", ["b"]);
      const node = createNode(
        commit,
        0,
        [createSwimlane("a")],
        [createSwimlane("b")],
      );

      const { container } = render(
        <GraphCell node={node} height={200} config={defaultConfig} />,
      );

      const circle = container.querySelector("circle");
      // Circle stays at ROW_HEIGHT / 2, not centered in expanded container
      expect(circle?.getAttribute("cy")).toBe("12");
    });
  });

  describe("Width Calculation", () => {
    it("should calculate width based on lanes", () => {
      const commit = createCommit("a", ["b", "c", "d"]);
      const node = createNode(
        commit,
        0,
        [createSwimlane("a")],
        [createSwimlane("b"), createSwimlane("c"), createSwimlane("d")],
      );

      const { container } = render(
        <GraphCell node={node} height={44} config={defaultConfig} />,
      );

      const svg = container.querySelector("svg");
      expect(svg?.getAttribute("width")).toBe("48"); // 3 lanes * 16
    });
  });

  describe("Color Application", () => {
    it("should apply color from swimlane", () => {
      const commit = createCommit("a", ["b"]);
      const node = createNode(
        commit,
        0,
        [createSwimlane("a", "branch-3")],
        [createSwimlane("b")],
      );

      const { container } = render(
        <GraphCell node={node} height={44} config={defaultConfig} />,
      );

      const circle = container.querySelector("circle");
      // Color should be applied via CSS variable
      expect(circle?.getAttribute("fill")).toContain("var(--");
    });
  });

  describe("Edge Cases", () => {
    it("should handle root commit (no parents)", () => {
      const commit = createCommit("a", []);
      const node = createNode(
        commit,
        0,
        [createSwimlane("a")],
        [], // no output
      );

      const { container } = render(
        <GraphCell node={node} height={44} config={defaultConfig} />,
      );

      // Should still render without errors
      const svg = container.querySelector("svg");
      expect(svg).toBeTruthy();

      const circle = container.querySelector("circle");
      expect(circle).toBeTruthy();
    });

    it("should handle merge commit", () => {
      const commit = createCommit("a", ["b", "c"]);
      const node = createNode(
        commit,
        0,
        [createSwimlane("a")],
        [createSwimlane("b"), createSwimlane("c")],
        { isMerge: true },
      );

      const { container } = render(
        <GraphCell node={node} height={44} config={defaultConfig} />,
      );

      // Should render without errors
      const svg = container.querySelector("svg");
      expect(svg).toBeTruthy();

      // Should have paths for both parents
      const paths = container.querySelectorAll("path");
      expect(paths.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle commit with no input lanes", () => {
      const commit = createCommit("a", ["b"]);
      const node = createNode(
        commit,
        0,
        [], // no input
        [createSwimlane("b")],
      );

      const { container } = render(
        <GraphCell node={node} height={44} config={defaultConfig} />,
      );

      // Should render without errors
      const svg = container.querySelector("svg");
      expect(svg).toBeTruthy();
    });
  });
});
