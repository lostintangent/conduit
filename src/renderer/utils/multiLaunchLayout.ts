/**
 * Multi-Launch Layout Utilities
 *
 * Calculates optimal pane layouts for multi-launch mode based on the number of agents.
 */

import type { SplitDirection } from "@/types";

export type LayoutStep = {
  direction: SplitDirection;
  insertBefore: boolean;
};

/**
 * Calculate the optimal layout strategy for a given number of agents
 *
 * @param agentCount Number of agents to launch
 * @returns Array of layout steps, one per agent (first agent uses source pane)
 */
export function calculateMultiLaunchLayout(agentCount: number): LayoutStep[] {
  if (agentCount <= 0) {
    return [];
  }

  if (agentCount === 1) {
    // Single agent, needs one split
    return [{ direction: "row", insertBefore: false }];
  }

  if (agentCount === 2) {
    // Two agents: side by side (first split to the right)
    // ┌─────────┬──────────┐
    // │ Source  │ Agent 1  │ <- First agent splits to the right
    // │         ├──────────┤
    // │         │ Agent 2  │ <- Second agent splits below first
    // └─────────┴──────────┘
    return [
      { direction: "row", insertBefore: false }, // First agent: split right of source
      { direction: "column", insertBefore: false }, // Second agent: split below first agent
    ];
  }

  if (agentCount === 3) {
    // Three agents: vertical splits to the right
    // ┌─────────┬──────────┐
    // │         │ Agent 1  │
    // │ Source  ├──────────┤
    // │         │ Agent 2  │
    // │         ├──────────┤
    // │         │ Agent 3  │
    // └─────────┴──────────┘
    return [
      { direction: "row", insertBefore: false }, // Agent 1: split right
      { direction: "column", insertBefore: false }, // Agent 2: split below Agent 1
      { direction: "column", insertBefore: false }, // Agent 3: split below Agent 2
    ];
  }

  if (agentCount === 4) {
    // Four agents: 2x2 grid to the right
    // ┌────────┬─────┬─────┐
    // │        │ Ag1 │ Ag2 │
    // │ Source ├─────┼─────┤
    // │        │ Ag3 │ Ag4 │
    // └────────┴─────┴─────┘
    return [
      { direction: "row", insertBefore: false }, // Agent 1: split right
      { direction: "row", insertBefore: false }, // Agent 2: split right of Agent 1
      { direction: "column", insertBefore: false }, // Agent 3: split below Agent 1
      { direction: "column", insertBefore: false }, // Agent 4: split below Agent 2
    ];
  }

  if (agentCount === 5) {
    // Five agents: 2 top, 3 bottom
    return [
      { direction: "row", insertBefore: false },
      { direction: "row", insertBefore: false },
      { direction: "column", insertBefore: false },
      { direction: "row", insertBefore: false },
      { direction: "row", insertBefore: false },
    ];
  }

  if (agentCount === 6) {
    // Six agents: 3x2 grid
    return [
      { direction: "row", insertBefore: false },
      { direction: "row", insertBefore: false },
      { direction: "row", insertBefore: false },
      { direction: "column", insertBefore: false },
      { direction: "column", insertBefore: false },
      { direction: "column", insertBefore: false },
    ];
  }

  // For 7+ agents, create a grid layout
  const cols = Math.ceil(Math.sqrt(agentCount));
  const rows = Math.ceil(agentCount / cols);

  const steps: LayoutStep[] = [];

  // First, create the columns (first row)
  for (let col = 1; col < cols; col++) {
    steps.push({ direction: "row", insertBefore: false });
  }

  // Then, create the rows for each column
  for (let col = 0; col < cols; col++) {
    const agentsInCol = Math.min(
      rows,
      agentCount - col * rows - (col === cols - 1 ? 0 : rows - 1),
    );
    for (let row = 1; row < agentsInCol; row++) {
      steps.push({ direction: "column", insertBefore: false });
    }
  }

  return steps.slice(0, agentCount); // We need N steps for N agents (each split creates one new pane)
}

/**
 * Get a human-readable description of the layout strategy
 *
 * @param agentCount Number of agents
 * @returns Description string
 */
export function getLayoutDescription(agentCount: number): string {
  if (agentCount <= 0) {
    return "No agents";
  }

  if (agentCount === 1) {
    return "Single pane";
  }

  if (agentCount === 2) {
    return "Side-by-side split";
  }

  if (agentCount === 3) {
    return "T-shape layout (1 top, 2 bottom)";
  }

  if (agentCount === 4) {
    return "2×2 grid";
  }

  if (agentCount === 5) {
    return "2 top, 3 bottom";
  }

  if (agentCount === 6) {
    return "3×2 grid";
  }

  const cols = Math.ceil(Math.sqrt(agentCount));
  const rows = Math.ceil(agentCount / cols);
  return `${cols}×${rows} grid`;
}
