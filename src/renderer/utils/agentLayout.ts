/**
 * Agent Layout Manager
 *
 * Intelligent layout generation for multi-agent pane splitting.
 * Automatically determines optimal split patterns based on agent count.
 */

export type SplitDirection = "row" | "column";

export interface LayoutSplit {
  direction: SplitDirection;
}

/**
 * Generate an intelligent layout plan for splitting panes based on total agent count.
 *
 * Layout patterns:
 * - 1 agent: No splits
 * - 2 agents: Horizontal split (side by side)
 * - 3 agents: Large left pane, two stacked right panes
 * - 4 agents: 2x2 grid
 * - 5 agents: Large top-left, three stacked right panes
 * - 6 agents: 3x2 grid
 * - 7-8 agents: Asymmetric layouts optimized for screen space
 * - 9+ agents: Dynamic grid layout (3x3 or larger)
 *
 * @param totalInstances - Total number of agent instances to layout
 * @returns Array of split operations to perform in sequence
 */
export function generateAgentLayout(totalInstances: number): LayoutSplit[] {
  const splits: LayoutSplit[] = [];

  if (totalInstances <= 1) {
    return splits;
  }

  // 2 agents: [A | B]
  if (totalInstances === 2) {
    splits.push({ direction: "row" });
  }
  // 3 agents: [A | B]
  //                [C]
  else if (totalInstances === 3) {
    splits.push({ direction: "row" });
    splits.push({ direction: "column" });
  }
  // 4 agents: [A | B]
  //           [C | D]
  else if (totalInstances === 4) {
    splits.push({ direction: "row" });
    splits.push({ direction: "column" });
    splits.push({ direction: "column" });
  }
  // 5 agents: [A A | B]
  //           [A A | C]
  //           [    | D]
  else if (totalInstances === 5) {
    splits.push({ direction: "row" });
    splits.push({ direction: "column" });
    splits.push({ direction: "column" });
    splits.push({ direction: "column" });
  }
  // 6 agents: [A | B | C]
  //           [D | E | F]
  else if (totalInstances === 6) {
    splits.push({ direction: "row" });
    splits.push({ direction: "row" });
    splits.push({ direction: "column" });
    splits.push({ direction: "column" });
    splits.push({ direction: "column" });
  }
  // 7 agents: [A A | B B | C]
  //           [A A | B B | D]
  //           [    |    | E]
  else if (totalInstances === 7) {
    splits.push({ direction: "row" });
    splits.push({ direction: "column" });
    splits.push({ direction: "column" });
    splits.push({ direction: "row" });
    splits.push({ direction: "row" });
    splits.push({ direction: "column" });
  }
  // 8 agents: [A A A | B B | C]
  //           [A A A | B B | D]
  //           [     |    | E]
  else if (totalInstances === 8) {
    splits.push({ direction: "row" });
    splits.push({ direction: "column" });
    splits.push({ direction: "column" });
    splits.push({ direction: "row" });
    splits.push({ direction: "row" });
    splits.push({ direction: "column" });
    splits.push({ direction: "column" });
  }
  // 9+ agents: Dynamic grid layout
  else {
    const rows = Math.ceil(Math.sqrt(totalInstances));
    const cols = Math.ceil(totalInstances / rows);

    // First create columns
    for (let i = 1; i < cols; i++) {
      splits.push({ direction: "row" });
    }

    // Then split each column into rows
    for (let col = 0; col < cols; col++) {
      const itemsInCol =
        col === cols - 1
          ? totalInstances - col * rows
          : Math.min(rows, totalInstances - col * rows);

      for (let row = 1; row < itemsInCol; row++) {
        splits.push({ direction: "column" });
      }
    }
  }

  return splits;
}
