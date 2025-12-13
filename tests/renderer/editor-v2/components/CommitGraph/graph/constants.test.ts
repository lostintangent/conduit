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
  MAX_VISIBLE_LANES,
  MIN_GRAPH_WIDTH,
  GRAPH_PADDING,
  CIRCLE_CENTER_Y,
  HEAD_OUTER_RADIUS,
  GRAPH_CONFIG,
  createConfig,
} from "@/components/panes/editor-v2/components/CommitGraph/graph/constants";

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

  describe("Layout Constraints", () => {
    it("should support multiple visible lanes", () => {
      expect(MAX_VISIBLE_LANES).toBeGreaterThan(1);
    });

    it("should have minimum graph width", () => {
      expect(MIN_GRAPH_WIDTH).toBeGreaterThan(0);
      expect(MIN_GRAPH_WIDTH).toBe(LANE_WIDTH * 2);
    });

    it("should have graph padding as half lane width", () => {
      expect(GRAPH_PADDING).toBe(LANE_WIDTH / 2);
    });
  });

  describe("Derived Constants", () => {
    it("should center circles vertically", () => {
      expect(CIRCLE_CENTER_Y).toBe(ROW_HEIGHT / 2);
    });

    it("should have larger outer radius for HEAD", () => {
      expect(HEAD_OUTER_RADIUS).toBeGreaterThan(CIRCLE_RADIUS);
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

  describe("createConfig", () => {
    it("should return defaults when no overrides", () => {
      const config = createConfig({});
      expect(config).toEqual(GRAPH_CONFIG);
    });

    it("should override specific values", () => {
      const config = createConfig({ rowHeight: 100 });
      expect(config.rowHeight).toBe(100);
      expect(config.laneWidth).toBe(LANE_WIDTH); // Unchanged
    });

    it("should allow overriding all values", () => {
      const config = createConfig({
        laneWidth: 20,
        rowHeight: 50,
        circleRadius: 6,
        curveRadius: 8,
        strokeWidth: 3,
      });
      expect(config.laneWidth).toBe(20);
      expect(config.rowHeight).toBe(50);
      expect(config.circleRadius).toBe(6);
      expect(config.curveRadius).toBe(8);
      expect(config.strokeWidth).toBe(3);
    });
  });
});
