import type {
  LayoutNode,
  LayoutPaneNode,
  LayoutSplitNode,
  SplitDirection,
} from "@/types";

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

export function findPaneNodeByPaneId(
  root: LayoutNode,
  paneId: string
): LayoutPaneNode | null {
  let match: LayoutPaneNode | null = null;

  walkLayout(root, ({ node }) => {
    if (node.type === "pane" && node.paneId === paneId) {
      match = node;
      return false;
    }
    return true;
  });

  return match;
}

export type LayoutPathEntry = {
  node: LayoutNode;
  parent: LayoutSplitNode | null;
  index: number;
};

export function findLayoutPath(
  node: LayoutNode,
  predicate: (candidate: LayoutNode) => boolean,
  parent: LayoutSplitNode | null = null,
  index = 0
): LayoutPathEntry[] | null {
  const currentEntry: LayoutPathEntry = { node, parent, index };
  if (predicate(node)) {
    return [currentEntry];
  }

  if (node.type !== "split") {
    return null;
  }

  for (let childIndex = 0; childIndex < node.children.length; childIndex += 1) {
    const child = node.children[childIndex];
    const childPath = findLayoutPath(child, predicate, node, childIndex);
    if (childPath) {
      return [currentEntry, ...childPath];
    }
  }

  return null;
}

/**
 * Check if a pane can be moved in a specific direction.
 */
export function canMovePane(
  layout: LayoutNode,
  paneId: string,
  direction: PaneDirection
): boolean {
  const path = findLayoutPath(
    layout,
    (candidate) => candidate.type === "pane" && candidate.paneId === paneId
  );

  if (!path || path.length < 2) {
    return false;
  }

  const { splitDirection: targetDirection, isForward } =
    getPaneDirectionConfig(direction);

  for (let i = path.length - 2; i >= 0; i -= 1) {
    const ancestorEntry = path[i];
    if (
      ancestorEntry.node.type !== "split" ||
      ancestorEntry.node.direction !== targetDirection
    ) {
      continue;
    }

    const childEntry = path[i + 1];
    const neighborIndex = childEntry.index + (isForward ? 1 : -1);
    if (
      neighborIndex < 0 ||
      neighborIndex >= ancestorEntry.node.children.length
    ) {
      continue;
    }

    return true;
  }

  return false;
}

