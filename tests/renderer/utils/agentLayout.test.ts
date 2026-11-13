import { describe, it, expect } from "vitest";
import { generateAgentLayout } from "@/utils/agentLayout";

describe("agentLayout", () => {
  describe("generateAgentLayout", () => {
    it("returns empty array for 1 agent", () => {
      const layout = generateAgentLayout(1);
      expect(layout).toEqual([]);
    });

    it("generates side-by-side layout for 2 agents", () => {
      const layout = generateAgentLayout(2);
      expect(layout).toEqual([{ direction: "row" }]);
    });

    it("generates asymmetric layout for 3 agents", () => {
      const layout = generateAgentLayout(3);
      expect(layout).toEqual([{ direction: "row" }, { direction: "column" }]);
    });

    it("generates 2x2 grid for 4 agents", () => {
      const layout = generateAgentLayout(4);
      expect(layout).toEqual([
        { direction: "row" },
        { direction: "column" },
        { direction: "column" },
      ]);
    });

    it("generates asymmetric layout for 5 agents", () => {
      const layout = generateAgentLayout(5);
      expect(layout).toHaveLength(4);
      expect(layout[0]).toEqual({ direction: "row" });
    });

    it("generates 3x2 grid for 6 agents", () => {
      const layout = generateAgentLayout(6);
      expect(layout).toHaveLength(5);
    });

    it("generates layout for 7 agents", () => {
      const layout = generateAgentLayout(7);
      expect(layout).toHaveLength(6);
    });

    it("generates layout for 8 agents", () => {
      const layout = generateAgentLayout(8);
      expect(layout).toHaveLength(7);
    });

    it("generates 3x3 grid for 9 agents", () => {
      const layout = generateAgentLayout(9);
      expect(layout).toHaveLength(8); // 9 panes = 8 splits
    });

    it("generates grid for 12 agents", () => {
      const layout = generateAgentLayout(12);
      expect(layout).toHaveLength(11); // 12 panes = 11 splits
    });

    it("generates correct number of splits", () => {
      for (let i = 1; i <= 20; i++) {
        const layout = generateAgentLayout(i);
        // Number of splits should be one less than number of panes
        expect(layout).toHaveLength(i - 1);
      }
    });
  });
});
