import { enterFocusMode } from "@/store/actions/focusMode";
import { movePaneToTarget } from "@/store/actions/pane";
import { applicationModeAtom } from "@/store/atoms";
import type { SplitDirection } from "@/types";
import { cn } from "@/utils";
import { useAtomValue } from "jotai";
import React, { useCallback, useState } from "react";

const DROP_ZONE_THRESHOLD = 0.4; // 40% threshold for edge detection

const DropZoneOverlay = ({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}): React.ReactElement => (
  <div
    className={cn(
      "pointer-events-none absolute z-30 bg-blueprint/40",
      className
    )}
    style={style}
  />
);

type DropZone = "top" | "bottom" | "left" | "right" | null;

interface UsePaneDragDropParams {
  onDropComplete: (paneId: string) => void;
}

interface UsePaneDragDropReturn {
  draggedPaneId: string | null;
  dragHoverPaneId: string | null;
  createDragHandlers: (
    paneId: string,
    tabId: string
  ) => {
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  createDropHandlers: (
    paneId: string,
    tabId: string
  ) => {
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

  const applicationMode = useAtomValue(applicationModeAtom);
  const isInDesignMode = applicationMode === "design";

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
    []
  );

  // Create drag handlers for a specific pane
  const createDragHandlers = useCallback(
    (paneId: string, tabId: string) => ({
      onDragStart: (e: React.DragEvent) => {
        if (!isInDesignMode) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", paneId);
        e.dataTransfer.setData("application/x-conduit-pane-drag", JSON.stringify({ paneId, tabId }));
        setDraggedPaneId(paneId);
        setSourceTabId(tabId);
      },
      onDragEnd: () => {
        setDraggedPaneId(null);
        setSourceTabId(null);
        setDropZone(null);
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
        onDragLeave: (e: React.DragEvent) => {
          setDropZone(null);
          setIsFocusModeDrag(false);

          setDragHoverPaneId((current) =>
            current === paneId ? null : current
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

          // Move the pane to the target position in a single atomic operation
          // Use sourceTabId if available (cross-tab drag), otherwise use tabId (same-tab drag)
          const sourceTab = sourceTabId || tabId;
          const success = movePaneToTarget(
            sourceTab,
            draggedPaneId,
            tabId,
            paneId,
            direction,
            insertBefore
          );

          if (!success) {
            // Clear drag state even if move failed
            setDraggedPaneId(null);
            setSourceTabId(null);
            setDropZone(null);
            setDragHoverPaneId(null);
            return;
          }

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
      onDropComplete,
    ]
  );

  // Render the drop zone overlay for a specific pane
  const renderDropZone = useCallback(
    (paneId: string): React.ReactNode => {
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
    [draggedPaneId, dragHoverPaneId, isInDesignMode, dropZone, isFocusModeDrag]
  );

  return {
    draggedPaneId,
    dragHoverPaneId,
    createDragHandlers,
    createDropHandlers,
    renderDropZone,
  };
}
