import { enterFocusMode } from "@/store/actions/focusMode";
import { detachPane, insertPaneAtTabRoot } from "@/store/actions/pane";
import { applicationModeAtom, tabsAtom } from "@/store/atoms";
import type { LayoutNode, Pane, SplitDirection } from "@/types";
import { cn } from "@/utils";
import { type EdgeZone, getDirectionFromZone } from "@/utils/dragDrop";
import { generateId } from "@shared/utils";
import { useAtomValue, useSetAtom } from "jotai";
import React, { useCallback, useState } from "react";

const DROP_ZONE_THRESHOLD = 0.4; // 40% threshold for edge detection
const TAB_EDGE_THRESHOLD = 40; // pixels from tab edge for root-level drops

const DropZoneOverlay = ({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}): React.ReactElement => (
  <div
    className={cn(
      "pointer-events-none absolute z-[35] bg-accent/40",
      className,
    )}
    style={style}
  />
);

type DropZone = EdgeZone | null;
type TabEdgeZone = EdgeZone | null;

interface UsePaneDragDropParams {
  onDropComplete: (paneId: string) => void;
}

interface UsePaneDragDropReturn {
  draggedPaneId: string | null;
  dragHoverPaneId: string | null;
  tabEdgeDropZone: TabEdgeZone;
  createDragHandlers: (
    paneId: string,
    tabId: string,
  ) => {
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  createDropHandlers: (
    paneId: string,
    tabId: string,
  ) => {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  createTabContainerDropHandlers: (tabId: string) => {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  renderDropZone: (paneId: string) => React.ReactNode;
}

export function usePaneDragDrop({
  onDropComplete,
}: UsePaneDragDropParams): UsePaneDragDropReturn {
  const [draggedPaneId, setDraggedPaneId] = useState<string | null>(null);
  const [sourceTabId, setSourceTabId] = useState<string | null>(null);
  const [dropZone, setDropZone] = useState<DropZone>(null);
  const [dragHoverPaneId, setDragHoverPaneId] = useState<string | null>(null);
  const [isFocusModeDrag, setIsFocusModeDrag] = useState(false);
  const [tabEdgeDropZone, setTabEdgeDropZone] = useState<TabEdgeZone>(null);

  const applicationMode = useAtomValue(applicationModeAtom);
  const isInDesignMode = applicationMode === "design";
  const setTabs = useSetAtom(tabsAtom);

  // Helper to check if a drag event is a focus mode drag
  const isFocusModeDragEvent = (e: React.DragEvent): boolean => {
    return e.dataTransfer.types.includes("application/x-conduit-focus-mode");
  };

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
    [],
  );

  // Helper to determine if cursor is at tab container edge (for root-level splits)
  const getTabEdgeZone = useCallback(
    (event: React.DragEvent, element: HTMLElement): TabEdgeZone => {
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Check if within threshold of container edges
      if (y < TAB_EDGE_THRESHOLD) return "top";
      if (y > rect.height - TAB_EDGE_THRESHOLD) return "bottom";
      if (x < TAB_EDGE_THRESHOLD) return "left";
      if (x > rect.width - TAB_EDGE_THRESHOLD) return "right";

      return null;
    },
    [],
  );

  // Helper to split an existing pane with a dragged pane
  const splitPaneWithExisting = useCallback(
    (
      tabId: string,
      targetPaneId: string,
      draggedPane: Pane,
      direction: SplitDirection,
      insertBefore: boolean,
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

          if (tab.locked) {
            return tab;
          }

          // Function to insert new pane into layout
          const insertPaneIntoLayout = (
            node: LayoutNode,
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
                newLayoutNode,
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

          const { node: newLayout, modified } = insertPaneIntoLayout(
            tab.layout,
          );

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
        }),
      );
    },
    [setTabs],
  );

  // Create drag handlers for a specific pane
  const createDragHandlers = useCallback(
    (paneId: string, tabId: string) => ({
      onDragStart: (e: React.DragEvent) => {
        if (!isInDesignMode) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", paneId);
        e.dataTransfer.setData(
          "application/x-conduit-pane-drag",
          JSON.stringify({ paneId, tabId }),
        );
        setDraggedPaneId(paneId);
        setSourceTabId(tabId);
      },
      onDragEnd: () => {
        setDraggedPaneId(null);
        setSourceTabId(null);
        setDropZone(null);
        setTabEdgeDropZone(null);
      },
    }),
    [isInDesignMode],
  );

  // Create drop handlers for the tab container (for root-level splits)
  const createTabContainerDropHandlers = useCallback(
    (tabId: string) => ({
      onDragOver: (e: React.DragEvent) => {
        if (!isInDesignMode || !draggedPaneId) return;

        const zone = getTabEdgeZone(e, e.currentTarget as HTMLElement);
        if (zone) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          setTabEdgeDropZone(zone);
        } else {
          setTabEdgeDropZone(null);
        }
      },
      onDragLeave: (e: React.DragEvent) => {
        // Only clear if leaving the container entirely
        const rect = e.currentTarget.getBoundingClientRect();
        const { clientX, clientY } = e;
        if (
          clientX < rect.left ||
          clientX > rect.right ||
          clientY < rect.top ||
          clientY > rect.bottom
        ) {
          setTabEdgeDropZone(null);
        }
      },
      onDrop: (e: React.DragEvent) => {
        if (!isInDesignMode || !draggedPaneId || !tabEdgeDropZone) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        // Determine direction and insertBefore based on tab edge zone
        const { direction, insertBefore } =
          getDirectionFromZone(tabEdgeDropZone);

        // Detach the pane from its original location
        const sourceTab = sourceTabId || tabId;
        const detachResult = detachPane(sourceTab, draggedPaneId);
        if (!detachResult) return;

        // Insert at root level of tab layout
        insertPaneAtTabRoot(tabId, detachResult.pane, direction, insertBefore);

        // Clear drag state
        setDraggedPaneId(null);
        setSourceTabId(null);
        setDropZone(null);
        setTabEdgeDropZone(null);
        setDragHoverPaneId(null);

        // Notify that drop is complete
        onDropComplete(draggedPaneId);
      },
    }),
    [
      isInDesignMode,
      draggedPaneId,
      sourceTabId,
      tabEdgeDropZone,
      getTabEdgeZone,
      onDropComplete,
    ],
  );

  // Create drop handlers for a specific pane
  const createDropHandlers = useCallback(
    (paneId: string, tabId: string) => {
      const isDragging = draggedPaneId === paneId;

      return {
        onDragOver: (e: React.DragEvent) => {
          // Check if this is a focus mode drag
          if (isFocusModeDragEvent(e)) {
            // Allow focus mode drop in any mode
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setIsFocusModeDrag(true);
            setDragHoverPaneId(paneId);
            return;
          }

          if (!isInDesignMode || !draggedPaneId || isDragging) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";

          setDragHoverPaneId(paneId);

          const zone = getDropZone(e, e.currentTarget as HTMLElement);
          setDropZone(zone);
        },
        onDragLeave: (_e: React.DragEvent) => {
          setDropZone(null);
          setIsFocusModeDrag(false);

          setDragHoverPaneId((current) =>
            current === paneId ? null : current,
          );
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();

          // Check if this is a focus mode drag
          if (isFocusModeDragEvent(e)) {
            enterFocusMode(tabId, paneId);

            setIsFocusModeDrag(false);
            setDragHoverPaneId(null);
            return;
          }

          if (!isInDesignMode || !draggedPaneId) {
            return;
          }

          const isSelfDrop = draggedPaneId === paneId;
          if (!dropZone || isSelfDrop) {
            setDraggedPaneId(null);
            setDropZone(null);
            setDragHoverPaneId(null);
            return;
          }

          // Determine direction and insertBefore based on drop zone
          const { direction, insertBefore } = getDirectionFromZone(dropZone);

          // Detach the pane from its original location
          // Use sourceTabId if available (cross-tab drag), otherwise use tabId (same-tab drag)
          const sourceTab = sourceTabId || tabId;
          const detachResult = detachPane(sourceTab, draggedPaneId);
          if (!detachResult) return;

          // Split the target pane with the dragged pane
          splitPaneWithExisting(
            tabId,
            paneId,
            detachResult.pane,
            direction,
            insertBefore,
          );

          // Clear drag state
          setDraggedPaneId(null);
          setSourceTabId(null);
          setDropZone(null);
          setDragHoverPaneId(null);

          // Notify that drop is complete
          onDropComplete(draggedPaneId);
        },
      };
    },
    [
      draggedPaneId,
      sourceTabId,
      isInDesignMode,
      dropZone,
      getDropZone,
      splitPaneWithExisting,
      onDropComplete,
    ],
  );

  // Render the drop zone overlay for a specific pane
  const renderDropZone = useCallback(
    (paneId: string): React.ReactNode => {
      // Suppress pane-level overlay when tab edge drop is active
      if (tabEdgeDropZone) {
        return null;
      }

      const isDragging = draggedPaneId === paneId;
      const isHoveredDuringDrag =
        draggedPaneId !== null && dragHoverPaneId === paneId && !isDragging;

      // Show drop zone for pane drag in design mode
      if (isInDesignMode && isHoveredDuringDrag && dropZone) {
        return (
          <DropZoneOverlay
            style={{
              top: dropZone === "top" ? 0 : dropZone === "bottom" ? "50%" : 0,
              left: dropZone === "left" ? 0 : dropZone === "right" ? "50%" : 0,
              right: dropZone === "right" ? 0 : dropZone === "left" ? "50%" : 0,
              bottom:
                dropZone === "bottom" ? 0 : dropZone === "top" ? "50%" : 0,
              width:
                dropZone === "left" || dropZone === "right" ? "50%" : "100%",
              height:
                dropZone === "top" || dropZone === "bottom" ? "50%" : "100%",
            }}
          />
        );
      }

      const isHoveredDuringFocusDrag =
        isFocusModeDrag && dragHoverPaneId === paneId;
      if (isHoveredDuringFocusDrag) {
        return <DropZoneOverlay className="inset-0" />;
      }

      return null;
    },
    [
      draggedPaneId,
      dragHoverPaneId,
      isInDesignMode,
      dropZone,
      isFocusModeDrag,
      tabEdgeDropZone,
    ],
  );

  return {
    draggedPaneId,
    dragHoverPaneId,
    tabEdgeDropZone,
    createDragHandlers,
    createDropHandlers,
    createTabContainerDropHandlers,
    renderDropZone,
  };
}
