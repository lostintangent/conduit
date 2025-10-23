import type { SplitDirection, LayoutNode, LayoutSplitNode } from "@/types";

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
  direction: PaneDirection
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
  index = 0
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
