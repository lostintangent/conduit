import { detachPane } from "@/store/actions/pane";
import { applicationModeAtom, tabsAtom } from "@/store/atoms";
import type {
  LayoutNode,
  Pane,
  SplitDirection,
} from "@/types";
import { generateId } from "@/utils/id";
import { useAtomValue, useSetAtom } from "jotai";
import React, { useCallback, useState } from "react";

const DROP_ZONE_THRESHOLD = 0.4; // 40% threshold for edge detection

type DropZone = "top" | "bottom" | "left" | "right" | null;

interface UsePaneDragDropParams {
  hoveredPaneId: string | null;
  setHoveredPaneId: (id: string | null) => void;
}

interface UsePaneDragDropReturn {
  draggedPaneId: string | null;
  createDragHandlers: (paneId: string, tabId: string) => {
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  createDropHandlers: (paneId: string, tabId: string) => {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
  };
  renderDropZone: (paneId: string) => React.ReactNode;
}

export function usePaneDragDrop({
  hoveredPaneId,
  setHoveredPaneId,
}: UsePaneDragDropParams): UsePaneDragDropReturn {
  const [draggedPaneId, setDraggedPaneId] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<DropZone>(null);

  const applicationMode = useAtomValue(applicationModeAtom);
  const isInDesignMode = applicationMode === "design";
  const setTabs = useSetAtom(tabsAtom);

  // Helper to determine drop zone based on mouse position
  const getDropZone = useCallback(
    (event: React.DragEvent, element: HTMLElement): DropZone => {
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const width = rect.width;
      const height = rect.height;

      // Calculate relative positions
      const relX = x / width;
      const relY = y / height;

      // Determine if in edge zones (20% threshold)
      if (relY < DROP_ZONE_THRESHOLD) return "top";
      if (relY > 1 - DROP_ZONE_THRESHOLD) return "bottom";
      if (relX < DROP_ZONE_THRESHOLD) return "left";
      if (relX > 1 - DROP_ZONE_THRESHOLD) return "right";

      return null;
    },
    []
  );

  // Helper to split an existing pane with a dragged pane
  const splitPaneWithExisting = useCallback(
    (
      tabId: string,
      targetPaneId: string,
      draggedPane: Pane,
      direction: SplitDirection,
      insertBefore: boolean
    ) => {
      const newLayoutNode: LayoutNode = {
        id: generateId(),
        type: "pane",
        paneId: draggedPane.id,
      };

      setTabs((current) =>
        current.map((tab) => {
          if (tab.id !== tabId) {
            return tab;
          }

          // Function to insert new pane into layout
          const insertPaneIntoLayout = (
            node: LayoutNode
          ): { node: LayoutNode; modified: boolean } => {
            if (node.type === "pane") {
              if (node.paneId === targetPaneId) {
                return {
                  node: {
                    id: generateId(),
                    type: "split",
                    direction,
                    children: insertBefore
                      ? [newLayoutNode, node]
                      : [node, newLayoutNode],
                  },
                  modified: true,
                };
              }
              return { node, modified: false };
            }

            const childIndex = node.children.findIndex((child) => {
              if (child.type === "pane") {
                return child.paneId === targetPaneId;
              }
              // Check if target pane is in this subtree
              let found = false;
              const checkNode = (n: LayoutNode): void => {
                if (n.type === "pane" && n.paneId === targetPaneId) {
                  found = true;
                  return;
                }
                if (n.type === "split") {
                  n.children.forEach(checkNode);
                }
              };
              checkNode(child);
              return found;
            });

            if (childIndex === -1) {
              return { node, modified: false };
            }

            const targetChild = node.children[childIndex];

            // If same direction and target is a pane, insert as sibling
            if (
              node.direction === direction &&
              targetChild.type === "pane" &&
              targetChild.paneId === targetPaneId
            ) {
              const newChildren = [...node.children];
              newChildren.splice(
                insertBefore ? childIndex : childIndex + 1,
                0,
                newLayoutNode
              );
              return {
                node: {
                  ...node,
                  children: newChildren,
                },
                modified: true,
              };
            }

            // Recurse into child
            const { node: updatedChild, modified } =
              insertPaneIntoLayout(targetChild);
            if (modified) {
              const newChildren = [...node.children];
              newChildren[childIndex] = updatedChild;
              return {
                node: {
                  ...node,
                  children: newChildren,
                },
                modified: true,
              };
            }

            return { node, modified: false };
          };

          const { node: newLayout, modified } = insertPaneIntoLayout(tab.layout);

          if (!modified) {
            return tab;
          }

          return {
            ...tab,
            panes: {
              ...tab.panes,
              [draggedPane.id]: draggedPane,
            },
            layout: newLayout,
            activePaneId: draggedPane.id,
          };
        })
      );
    },
    [setTabs]
  );

  // Create drag handlers for a specific pane
  const createDragHandlers = useCallback(
    (paneId: string, tabId: string) => ({
      onDragStart: (e: React.DragEvent) => {
        if (!isInDesignMode) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", paneId);
        setDraggedPaneId(paneId);
      },
      onDragEnd: () => {
        setDraggedPaneId(null);
        setDropZone(null);
        setHoveredPaneId(null);
      },
    }),
    [isInDesignMode]
  );

  // Create drop handlers for a specific pane
  const createDropHandlers = useCallback(
    (paneId: string, tabId: string) => {
      const isDragging = draggedPaneId === paneId;

      return {
        onDragOver: (e: React.DragEvent) => {
          if (!isInDesignMode || !draggedPaneId || isDragging) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";

          // Update hovered pane since mouse events don't fire during drag
          setHoveredPaneId(paneId);

          const zone = getDropZone(e, e.currentTarget as HTMLElement);
          setDropZone(zone);
        },
        onDragLeave: () => {
          setDropZone(null);
          setHoveredPaneId(null);
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          if (!isInDesignMode || !draggedPaneId || !dropZone) {
            return;
          }

          // Determine direction and insertBefore based on drop zone
          let direction: SplitDirection;
          let insertBefore: boolean;

          switch (dropZone) {
            case "top":
              direction = "column";
              insertBefore = true;
              break;
            case "bottom":
              direction = "column";
              insertBefore = false;
              break;
            case "left":
              direction = "row";
              insertBefore = true;
              break;
            case "right":
              direction = "row";
              insertBefore = false;
              break;
            default:
              return;
          }

          // Detach the pane from its original location (uses current active tab)
          const detachResult = detachPane(tabId, draggedPaneId);
          if (!detachResult) return;

          // Split the target pane with the dragged pane
          splitPaneWithExisting(
            tabId,
            paneId,
            detachResult.pane,
            direction,
            insertBefore
          );

          // Set the dropped pane as hovered to show its controls
          setHoveredPaneId(draggedPaneId);

          // Clear drag state
          setDraggedPaneId(null);
          setDropZone(null);
        },
      };
    },
    [
      draggedPaneId,
      isInDesignMode,
      dropZone,
      getDropZone,
      setHoveredPaneId,
      splitPaneWithExisting,
    ]
  );

  // Render the drop zone overlay for a specific pane
  const renderDropZone = useCallback(
    (paneId: string): React.ReactNode => {
      const isDragging = draggedPaneId === paneId;
      const isHoveredDuringDrag =
        draggedPaneId !== null && hoveredPaneId === paneId && !isDragging;

      if (!isInDesignMode || !isHoveredDuringDrag || !dropZone) {
        return null;
      }

      return (
        <div
          className="pointer-events-none absolute z-30 bg-blueprint/40"
          style={{
            top: dropZone === "top" ? 0 : dropZone === "bottom" ? "50%" : 0,
            left: dropZone === "left" ? 0 : dropZone === "right" ? "50%" : 0,
            right: dropZone === "right" ? 0 : dropZone === "left" ? "50%" : 0,
            bottom: dropZone === "bottom" ? 0 : dropZone === "top" ? "50%" : 0,
            width:
              dropZone === "left" || dropZone === "right" ? "50%" : "100%",
            height:
              dropZone === "top" || dropZone === "bottom" ? "50%" : "100%",
          }}
        />
      );
    },
    [draggedPaneId, hoveredPaneId, isInDesignMode, dropZone]
  );

  return {
    draggedPaneId,
    createDragHandlers,
    createDropHandlers,
    renderDropZone,
  };
}
