import { tabsAtom } from "@/store/atoms";
import type { LayoutNode, SplitDirection } from "@/types";
import { walkLayout } from "@/utils/layout";
import { useAtom } from "@tanstack/react-store";
import { produce } from "immer";
import { useCallback, useState } from "react";

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

type LayoutResizeUpdate = {
  size: number;
  pixelSize?: number;
};

const MIN_PANE_SIZE_PX = 200;
const COLLAPSE_THRESHOLD_PX = 100;

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

const stripLayoutSizes = (node: LayoutNode): void => {
  if (node.size !== undefined) {
    delete node.size;
  }

  if (node.type === "split") {
    node.children.forEach(stripLayoutSizes);
  }
};

export const useLayoutResizing = () => {
  const [tabs, setTabs] = useAtom(tabsAtom);
  const [resizingNode, setResizingNode] = useState<string | null>(null);

  const applySizeUpdates = useCallback(
    (tabId: string, updates: Map<string, LayoutResizeUpdate>): boolean => {
      if (updates.size === 0) {
        return false;
      }

      let didCollapse = false;

      setTabs(
        produce((tabs) => {
          const tab = tabs.find(({ id }) => id === tabId);
          if (!tab) {
            return;
          }

          walkLayout(tab.layout, ({ node }) => {
            const pendingUpdate = updates.get(node.id);

            // Only update size if pixelSize >= MIN_PANE_SIZE_PX or if no pixelSize is provided
            const shouldUpdateSize =
              pendingUpdate === undefined ||
              pendingUpdate.pixelSize === undefined ||
              pendingUpdate.pixelSize >= MIN_PANE_SIZE_PX;

            if (shouldUpdateSize && pendingUpdate !== undefined) {
              node.size = pendingUpdate.size;
            }

            if (pendingUpdate && node.type === "pane") {
              if (node.collapsed) {
                delete node.collapsed;
              }

              if (
                pendingUpdate.pixelSize !== undefined &&
                pendingUpdate.pixelSize < COLLAPSE_THRESHOLD_PX
              ) {
                node.collapsed = true;
                didCollapse = true;
              }
            }
          });
        }),
      );

      return didCollapse;
    },
    [setTabs],
  );

  const handleResizeStart = useCallback(
    (
      e: React.MouseEvent,
      { tabId, axes, activeHandleId }: LayoutResizeStartConfig,
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
          `[data-node-id="${axis.containerNodeId}"]`,
        ),
        totalSize: axis.leadingSize + axis.trailingSize,
      }));

      let rafId: number | null = null;
      let pendingUpdates: Map<string, LayoutResizeUpdate> | null = null;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const sizeUpdates = new Map<string, LayoutResizeUpdate>();

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
              Math.min(totalSize - 0.1, rawLeading),
            );
            const clampedTrailing = totalSize - clampedLeading;
            const leadingPixels = (clampedLeading / totalSize) * containerSize;
            const trailingPixels = containerSize - leadingPixels;

            // Enforce minimum size of MIN_PANE_SIZE_PX, unless collapsing below COLLAPSE_THRESHOLD_PX
            let finalLeading = clampedLeading;
            let finalTrailing = clampedTrailing;
            let finalLeadingPixels = leadingPixels;
            let finalTrailingPixels = trailingPixels;

            // If leading pane would be between COLLAPSE_THRESHOLD_PX and MIN_PANE_SIZE_PX, clamp it to MIN_PANE_SIZE_PX
            if (
              leadingPixels >= COLLAPSE_THRESHOLD_PX &&
              leadingPixels < MIN_PANE_SIZE_PX
            ) {
              finalLeadingPixels = MIN_PANE_SIZE_PX;
              finalLeading = (MIN_PANE_SIZE_PX / containerSize) * totalSize;
              finalTrailing = totalSize - finalLeading;
              finalTrailingPixels = containerSize - MIN_PANE_SIZE_PX;
            }
            // If trailing pane would be between COLLAPSE_THRESHOLD_PX and MIN_PANE_SIZE_PX, clamp it to MIN_PANE_SIZE_PX
            else if (
              trailingPixels >= COLLAPSE_THRESHOLD_PX &&
              trailingPixels < MIN_PANE_SIZE_PX
            ) {
              finalTrailingPixels = MIN_PANE_SIZE_PX;
              finalTrailing = (MIN_PANE_SIZE_PX / containerSize) * totalSize;
              finalLeading = totalSize - finalTrailing;
              finalLeadingPixels = containerSize - MIN_PANE_SIZE_PX;
            }

            sizeUpdates.set(axis.leadingNodeId, {
              size: finalLeading,
              pixelSize: finalLeadingPixels,
            });
            sizeUpdates.set(axis.trailingNodeId, {
              size: finalTrailing,
              pixelSize: finalTrailingPixels,
            });
          },
        );

        // Store pending updates and schedule RAF if not already scheduled
        pendingUpdates = sizeUpdates;
        if (rafId === null) {
          rafId = requestAnimationFrame(() => {
            if (pendingUpdates) {
              const collapsed = applySizeUpdates(tabId, pendingUpdates);
              pendingUpdates = null;

              // If a pane was collapsed, cancel the resize operation
              if (collapsed) {
                handleMouseUp();
              }
            }
            rafId = null;
          });
        }
      };

      const handleMouseUp = () => {
        // Apply any final pending updates immediately
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        if (pendingUpdates) {
          applySizeUpdates(tabId, pendingUpdates);
          pendingUpdates = null;
        }

        setResizingNode(null);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [applySizeUpdates],
  );

  const hasCustomLayout = useCallback(
    (tabId: string) => {
      const tab = tabs.find((candidate) => candidate.id === tabId);
      if (!tab) {
        return false;
      }

      return layoutHasCustomSizes(tab.layout);
    },
    [tabs],
  );

  const resetLayoutSizes = useCallback(
    (tabId: string) => {
      setTabs(
        produce((tabs) => {
          const tab = tabs.find(({ id }) => id === tabId);
          if (!tab) {
            return;
          }

          stripLayoutSizes(tab.layout);
        }),
      );
    },
    [setTabs],
  );

  return {
    resizingNode,
    handleResizeStart,
    hasCustomLayout,
    resetLayoutSizes,
  };
};
