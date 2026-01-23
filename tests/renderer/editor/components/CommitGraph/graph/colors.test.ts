/**
 * Tests for the graph color system.
 */

import { describe, it, expect } from "vitest";
import {
  BRANCH_COLOR_COUNT,
  ROTATING_COLORS,
  GRAPH_COLOR_CSS,
  GRAPH_COLOR_CLASSES,
  getNextColor,
  getColorCss,
  getColorClass,
  isSemanticColor,
} from "@/components/panes/editor/components/CommitGraph/graph/colors";

describe("Graph Colors", () => {
  describe("Constants", () => {
    it("should have correct number of rotating colors", () => {
      expect(ROTATING_COLORS.length).toBe(BRANCH_COLOR_COUNT);
      expect(BRANCH_COLOR_COUNT).toBe(5);
    });

    it("should have CSS values for all colors", () => {
      const allColors = ["current", "remote", "base", ...ROTATING_COLORS];
      for (const color of allColors) {
        expect(
          GRAPH_COLOR_CSS[color as keyof typeof GRAPH_COLOR_CSS],
        ).toBeDefined();
        expect(
          GRAPH_COLOR_CSS[color as keyof typeof GRAPH_COLOR_CSS],
        ).toContain("var(--");
      }
    });

    it("should have Tailwind classes for all colors", () => {
      const allColors = ["current", "remote", "base", ...ROTATING_COLORS];
      for (const color of allColors) {
        expect(
          GRAPH_COLOR_CLASSES[color as keyof typeof GRAPH_COLOR_CLASSES],
        ).toBeDefined();
        expect(
          GRAPH_COLOR_CLASSES[color as keyof typeof GRAPH_COLOR_CLASSES],
        ).toContain("text-");
      }
    });
  });

  describe("getNextColor", () => {
    it("should return colors in sequence", () => {
      expect(getNextColor(0)).toBe("branch-1");
      expect(getNextColor(1)).toBe("branch-2");
      expect(getNextColor(2)).toBe("branch-3");
      expect(getNextColor(3)).toBe("branch-4");
      expect(getNextColor(4)).toBe("branch-5");
    });

    it("should wrap around after exhausting palette", () => {
      expect(getNextColor(5)).toBe("branch-1");
      expect(getNextColor(6)).toBe("branch-2");
      expect(getNextColor(10)).toBe("branch-1");
    });

    it("should handle large indices", () => {
      expect(getNextColor(100)).toBe("branch-1"); // 100 % 5 = 0
      expect(getNextColor(103)).toBe("branch-4"); // 103 % 5 = 3
    });

    it("should handle negative indices gracefully", () => {
      // Negative indices should still produce valid colors
      const color = getNextColor(-1);
      expect(ROTATING_COLORS).toContain(color);
    });
  });

  describe("getColorCss", () => {
    it("should return CSS variable for semantic colors", () => {
      expect(getColorCss("current")).toContain("--color-graph-current");
      expect(getColorCss("remote")).toContain("--color-graph-remote");
      expect(getColorCss("base")).toContain("--color-graph-base");
    });

    it("should return CSS variable for branch colors", () => {
      expect(getColorCss("branch-1")).toContain("--color-graph-branch-1");
      expect(getColorCss("branch-5")).toContain("--color-graph-branch-5");
    });

    it("should include fallback colors", () => {
      // CSS variables should have fallback hex colors
      expect(getColorCss("current")).toMatch(/var\(--.*,\s*#[0-9a-f]{6}\)/i);
    });
  });

  describe("getColorClass", () => {
    it("should return Tailwind classes for all colors", () => {
      expect(getColorClass("current")).toBe("text-blue-500");
      expect(getColorClass("remote")).toBe("text-purple-500");
      expect(getColorClass("base")).toBe("text-orange-500");
      expect(getColorClass("branch-1")).toBe("text-green-500");
    });
  });

  describe("isSemanticColor", () => {
    it("should return true for semantic colors", () => {
      expect(isSemanticColor("current")).toBe(true);
      expect(isSemanticColor("remote")).toBe(true);
      expect(isSemanticColor("base")).toBe(true);
    });

    it("should return false for branch colors", () => {
      expect(isSemanticColor("branch-1")).toBe(false);
      expect(isSemanticColor("branch-2")).toBe(false);
      expect(isSemanticColor("branch-5")).toBe(false);
    });
  });
});
