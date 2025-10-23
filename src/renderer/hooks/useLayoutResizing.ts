import { useCallback, useState } from "react";
import { useAtom } from "jotai";
import type {
  LayoutNode,
  LayoutPaneNode,
  LayoutSplitNode,
  SplitDirection,
} from "@/types";
import { tabsAtom } from "@/store/atoms";
import { walkLayout } from "@/utils/layout";

export type LayoutResizeAxis = {
  containerNodeId: string;
  direction: SplitDirection;
  leadingNodeId: string;
  trailingNodeId: string;
  leadingSize: number;
  trailingSize: number;
};

export type LayoutResizeStartConfig = {
  tabId: string;
  axes: LayoutResizeAxis[];
  activeHandleId: string;
};

const layoutHasCustomSizes = (node: LayoutNode): boolean => {
  let hasCustomSize = false;
  walkLayout(node, ({ node: current }) => {
    if (current.size !== undefined) {
      hasCustomSize = true;
      return false;
    }
    return true;
  });
  return hasCustomSize;
};

const stripLayoutSizes = (node: LayoutNode): LayoutNode => {
  if (node.type === "split") {
    const cleanedChildren = node.children.map(stripLayoutSizes);
    const hasChanged =
      node.size !== undefined ||
      cleanedChildren.some((child, index) => child !== node.children[index]);

    if (!hasChanged) {
      return node;
    }

    return {
      id: node.id,
      type: "split",
      direction: node.direction,
      children: cleanedChildren,
    } as LayoutSplitNode;
  }

  if (node.size === undefined) {
    return node;
  }

  return {
    id: node.id,
    type: "pane",
    paneId: node.paneId,
  } as LayoutPaneNode;
};

export const useLayoutResizing = () => {
  const [tabs, setTabs] = useAtom(tabsAtom);
  const [resizingNode, setResizingNode] = useState<string | null>(null);

  const applySizeUpdates = useCallback(
    (tabId: string, updates: Map<string, number>) => {
      if (updates.size === 0) {
        return;
      }

      setTabs((current) =>
        current.map((tab) => {
          if (tab.id !== tabId) {
            return tab;
          }

          const updateNode = (node: LayoutNode): LayoutNode => {
            const pendingSize = updates.get(node.id);
            const baseNode =
              pendingSize !== undefined ? { ...node, size: pendingSize } : node;

            if (baseNode.type === "split") {
              let childChanged = false;
              const newChildren = baseNode.children.map((child) => {
                const updatedChild = updateNode(child);
                if (updatedChild !== child) {
                  childChanged = true;
                }
                return updatedChild;
              });

              if (childChanged) {
                return { ...baseNode, children: newChildren };
              }
            }

            return baseNode;
          };

          return {
            ...tab,
            layout: updateNode(tab.layout),
          };
        })
      );
    },
    [setTabs]
  );

  const handleResizeStart = useCallback(
    (
      e: React.MouseEvent,
      { tabId, axes, activeHandleId }: LayoutResizeStartConfig
    ) => {
      e.preventDefault();
      if (axes.length === 0) {
        return;
      }

      setResizingNode(activeHandleId);

      const axisContexts = axes.map((axis) => ({
        axis,
        startPos: axis.direction === "row" ? e.clientX : e.clientY,
        containerElement: document.querySelector<HTMLElement>(
          `[data-node-id="${axis.containerNodeId}"]`
        ),
        totalSize: axis.leadingSize + axis.trailingSize,
      }));

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const sizeUpdates = new Map<string, number>();

        axisContexts.forEach(
          ({ axis, startPos, containerElement, totalSize }) => {
            if (!containerElement || totalSize <= 0) {
              return;
            }

            const rect = containerElement.getBoundingClientRect();
            const containerSize =
              axis.direction === "row" ? rect.width : rect.height;

            if (containerSize <= 0) {
              return;
            }

            const currentPos =
              axis.direction === "row" ? moveEvent.clientX : moveEvent.clientY;
            const delta = currentPos - startPos;
            const deltaFraction = delta / containerSize;

            const rawLeading = axis.leadingSize + deltaFraction * totalSize;
            const clampedLeading = Math.max(
              0.1,
              Math.min(totalSize - 0.1, rawLeading)
            );
            const clampedTrailing = totalSize - clampedLeading;

            sizeUpdates.set(axis.leadingNodeId, clampedLeading);
            sizeUpdates.set(axis.trailingNodeId, clampedTrailing);
          }
        );

        applySizeUpdates(tabId, sizeUpdates);
      };

      const handleMouseUp = () => {
        setResizingNode(null);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [applySizeUpdates]
  );

  const hasCustomLayout = useCallback(
    (tabId: string) => {
      const tab = tabs.find((candidate) => candidate.id === tabId);
      if (!tab) {
        return false;
      }

      return layoutHasCustomSizes(tab.layout);
    },
    [tabs]
  );

  const resetLayoutSizes = useCallback(
    (tabId: string) => {
      setTabs((current) =>
        current.map((tab) => {
          if (tab.id !== tabId) {
            return tab;
          }

          const cleanedLayout = stripLayoutSizes(tab.layout);
          if (cleanedLayout === tab.layout) {
            return tab;
          }

          return {
            ...tab,
            layout: cleanedLayout,
          };
        })
      );
    },
    [setTabs]
  );

  return {
    resizingNode,
    handleResizeStart,
    hasCustomLayout,
    resetLayoutSizes,
  };
};
