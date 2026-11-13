/**
 * Tests for graph rendering constants.
 */

import { describe, it, expect } from "vitest";
import {
  LANE_WIDTH,
  ROW_HEIGHT,
  CIRCLE_RADIUS,
  CURVE_RADIUS,
  STROKE_WIDTH,
  GRAPH_CONFIG,
} from "@/components/panes/editor/components/CommitGraph/graph/constants";

describe("Graph Constants", () => {
  describe("Core Dimensions", () => {
    it("should have reasonable lane width", () => {
      expect(LANE_WIDTH).toBeGreaterThan(0);
      expect(LANE_WIDTH).toBeLessThanOrEqual(32); // Not too wide
    });

    it("should have reasonable row height", () => {
      expect(ROW_HEIGHT).toBeGreaterThan(20); // At least 2 lines of text
      expect(ROW_HEIGHT).toBeLessThanOrEqual(100);
    });

    it("should have reasonable circle radius", () => {
      expect(CIRCLE_RADIUS).toBeGreaterThan(2);
      expect(CIRCLE_RADIUS).toBeLessThan(LANE_WIDTH / 2); // Fits within lane
    });

    it("should have curve radius for smooth curves", () => {
      expect(CURVE_RADIUS).toBeGreaterThan(0);
      expect(CURVE_RADIUS).toBeLessThanOrEqual(LANE_WIDTH);
    });

    it("should have visible stroke width", () => {
      expect(STROKE_WIDTH).toBeGreaterThan(0);
      expect(STROKE_WIDTH).toBeLessThanOrEqual(4);
    });
  });

  describe("GRAPH_CONFIG", () => {
    it("should bundle all necessary config values", () => {
      expect(GRAPH_CONFIG.laneWidth).toBe(LANE_WIDTH);
      expect(GRAPH_CONFIG.rowHeight).toBe(ROW_HEIGHT);
      expect(GRAPH_CONFIG.circleRadius).toBe(CIRCLE_RADIUS);
      expect(GRAPH_CONFIG.curveRadius).toBe(CURVE_RADIUS);
      expect(GRAPH_CONFIG.strokeWidth).toBe(STROKE_WIDTH);
    });
  });
});
