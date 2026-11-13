import type { LayoutNode, LayoutSplitNode, SplitDirection } from "@/types";

export type PaneDirection = "left" | "right" | "up" | "down";

export type PaneDirectionConfig = {
  axis: "horizontal" | "vertical";
  isForward: boolean;
  splitDirection: SplitDirection;
};

const PANE_DIRECTION_CONFIG: Record<PaneDirection, PaneDirectionConfig> = {
  left: { axis: "horizontal", isForward: false, splitDirection: "row" },
  right: { axis: "horizontal", isForward: true, splitDirection: "row" },
  up: { axis: "vertical", isForward: false, splitDirection: "column" },
  down: { axis: "vertical", isForward: true, splitDirection: "column" },
};

export const getPaneDirectionConfig = (
  direction: PaneDirection,
): PaneDirectionConfig => PANE_DIRECTION_CONFIG[direction];

export type WalkLayoutCallback = (context: {
  node: LayoutNode;
  parent: LayoutSplitNode | null;
  index: number;
}) => boolean | void;

/**
 * Depth-first traversal helper for layout trees. Returning `false` from the
 * callback stops further traversal.
 */
export const walkLayout = (
  node: LayoutNode,
  callback: WalkLayoutCallback,
  parent: LayoutSplitNode | null = null,
  index = 0,
): boolean => {
  const result = callback({ node, parent, index });
  if (result === false) {
    return false;
  }

  if (node.type !== "split") {
    return true;
  }

  for (let childIndex = 0; childIndex < node.children.length; childIndex += 1) {
    const child = node.children[childIndex];
    const shouldContinue = walkLayout(child, callback, node, childIndex);
    if (!shouldContinue) {
      return false;
    }
  }

  return true;
};

/**
 * Count the number of panes in a layout tree
 */
export function countPanesInLayout(root: LayoutNode): number {
  let count = 0;

  walkLayout(root, ({ node }) => {
    if (node.type === "pane") {
      count += 1;
    }
    return true;
  });

  return count;
}

/**
 * Check if a layout node contains a specific pane ID
 */
export function layoutContainsPaneId(
  node: LayoutNode,
  paneId: string,
): boolean {
  if (node.type === "pane") {
    return node.paneId === paneId;
  }

  // For split nodes, check children recursively
  return node.children.some((child) => layoutContainsPaneId(child, paneId));
}
