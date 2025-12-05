import { closePane, movePane, splitPane } from "@/store/actions/pane";
import { movePaneToTab } from "@/store/actions/tab";
import type { SplitDirection } from "@/types";
import type { PaneDirection } from "@/utils/layout";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CornerUpRight,
  Grip,
  SplitSquareHorizontal,
  SplitSquareVertical,
  X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import {
  PaneControlFanButtons,
  type SplitButtonPosition,
} from "./PaneControlFanButtons";

/**
 * Custom hook to manage fan menu visibility with timeout-based hiding
 */
function useFanMenuState() {
  const [hoveredPosition, setHoveredPosition] =
    useState<SplitButtonPosition | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const handleVisibilityChange = useCallback(
    (position: SplitButtonPosition, visible: boolean) => {
      if (!visible) {
        // Clear any existing timeout and set a new one
        clearHideTimeout();
        hideTimeoutRef.current = setTimeout(() => {
          setHoveredPosition((current) => {
            // Only clear if we're still showing this position
            return current === position ? null : current;
          });
        }, 350);
      } else {
        // Cancel any pending hide and immediately switch to this position
        clearHideTimeout();
        setHoveredPosition(position);
      }
    },
    [clearHideTimeout],
  );

  return {
    hoveredPosition,
    handleVisibilityChange,
  };
}

interface PaneControlButtonsProps {
  tabId: string;
  paneId: string;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isOnlyPane: boolean;
  isOnlyTab: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onOpenPaneActions?: () => void;
}

export function PaneControlButtons({
  tabId,
  paneId,
  canMoveLeft,
  canMoveRight,
  canMoveUp,
  canMoveDown,
  isOnlyPane,
  isOnlyTab,
  onDragStart,
  onDragEnd,
  onOpenPaneActions,
}: PaneControlButtonsProps) {
  const { hoveredPosition: hoveredSplitButton, handleVisibilityChange } =
    useFanMenuState();

  const handleSplit = (direction: SplitDirection, insertBefore: boolean) => {
    void splitPane(tabId, paneId, direction, insertBefore);
  };

  const handleMove = (direction: PaneDirection) => {
    movePane(tabId, paneId, direction);
  };

  const groupBaseClass =
    "bg-elevated border border-accent border-dashed rounded-lg backdrop-blur-sm overflow-hidden pointer-events-auto";

  const dividerColorClass = "divide-accent";

  const groupClasses = {
    center: `${groupBaseClass} flex divide-x ${dividerColorClass} divide-dashed`,
    top: `${groupBaseClass} flex divide-x ${dividerColorClass} divide-dashed rounded-t-none border-t-0`,
    bottom: `${groupBaseClass} flex divide-x ${dividerColorClass} rounded-b-none divide-dashed border-b-0`,
    left: `${groupBaseClass} flex flex-col divide-y ${dividerColorClass} rounded-l-none divide-dashed border-l-0`,
    right: `${groupBaseClass} flex flex-col divide-y ${dividerColorClass} rounded-r-none divide-dashed border-r-0`,
  } as const;

  const buttonClass =
    "flex items-center justify-center w-11 h-11 rounded-none hover:bg-accent hover:text-background transition-all duration-200 hover:scale-110 hover:shadow-[0_0_20px_rgba(59,130,246,0.6)] active:scale-95";

  const iconClass = "w-5 h-5 pointer-events-none";

  // Show move to new tab button if there are multiple panes in the tab
  const showMoveToNewTab = !isOnlyPane;

  // Show close button if there are multiple panes OR multiple tabs
  const showClose = !isOnlyPane || !isOnlyTab;

  return (
    <div
      className="absolute inset-0"
      onMouseLeave={() => {
        if (hoveredSplitButton) {
          handleVisibilityChange(hoveredSplitButton, false);
        }
      }}
      style={{ pointerEvents: "none" }}
    >
      {/* Center buttons (Drag grip, Move to new tab, and Close) */}
      {(showMoveToNewTab || showClose) && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2 pointer-events-none">
          <div className={groupClasses.center}>
            {showMoveToNewTab && (
              <button
                className={buttonClass}
                onClick={() => movePaneToTab(tabId, paneId)}
                title="Move pane to new tab (Alt+T)"
              >
                <CornerUpRight className={iconClass} />
              </button>
            )}
            <button
              draggable
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              className={`${buttonClass} cursor-grab active:cursor-grabbing`}
              title="Drag to move pane"
              type="button"
            >
              <Grip className={iconClass} />
            </button>
            {showClose && (
              <button
                className={buttonClass}
                onClick={() => closePane(tabId, paneId)}
                title="Close pane (Alt+W)"
              >
                <X className={iconClass} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top buttons */}
      <div
        className={`absolute top-0 left-1/2 -translate-x-1/2 z-20 ${groupClasses.top}`}
      >
        <button
          className={buttonClass}
          onClick={() => handleSplit("column", true)}
          onMouseEnter={() => handleVisibilityChange("top", true)}
          onMouseLeave={() => handleVisibilityChange("top", false)}
          title="Split above (Alt+Shift+↑)"
        >
          <SplitSquareVertical className={iconClass} />
        </button>

        {canMoveUp && (
          <button
            className={buttonClass}
            onClick={() => handleMove("up")}
            title="Move pane up (Alt+↑)"
          >
            <ArrowUp className={iconClass} />
          </button>
        )}
      </div>

      {/* Fan-out menu for top split */}
      <PaneControlFanButtons
        tabId={tabId}
        paneId={paneId}
        position="top"
        direction="column"
        insertBefore={true}
        hasMoveButton={canMoveUp}
        isHovered={hoveredSplitButton === "top"}
        onVisibilityChange={(visible) => handleVisibilityChange("top", visible)}
        onOpenPaneActions={onOpenPaneActions}
      />

      {/* Bottom buttons */}
      <div
        className={`absolute bottom-0 left-1/2 -translate-x-1/2 z-20 ${groupClasses.bottom}`}
      >
        <button
          className={buttonClass}
          onClick={() => handleSplit("column", false)}
          onMouseEnter={() => handleVisibilityChange("bottom", true)}
          onMouseLeave={() => handleVisibilityChange("bottom", false)}
          title="Split below (Alt+Shift+↓)"
        >
          <SplitSquareVertical className={iconClass} />
        </button>

        {canMoveDown && (
          <button
            className={buttonClass}
            onClick={() => handleMove("down")}
            title="Move pane down (Alt+↓)"
          >
            <ArrowDown className={iconClass} />
          </button>
        )}
      </div>

      {/* Fan-out menu for bottom split */}
      <PaneControlFanButtons
        tabId={tabId}
        paneId={paneId}
        position="bottom"
        direction="column"
        insertBefore={false}
        hasMoveButton={canMoveDown}
        isHovered={hoveredSplitButton === "bottom"}
        onVisibilityChange={(visible) =>
          handleVisibilityChange("bottom", visible)
        }
        onOpenPaneActions={onOpenPaneActions}
      />

      {/* Left buttons */}
      <div
        className={`absolute left-0 top-1/2 -translate-y-1/2 z-20 ${groupClasses.left}`}
      >
        <button
          className={buttonClass}
          onClick={() => handleSplit("row", true)}
          onMouseEnter={() => handleVisibilityChange("left", true)}
          onMouseLeave={() => handleVisibilityChange("left", false)}
          title="Split left (Alt+Shift+←)"
        >
          <SplitSquareHorizontal className={iconClass} />
        </button>

        {canMoveLeft && (
          <button
            className={buttonClass}
            onClick={() => handleMove("left")}
            title="Move pane left (Alt+←)"
          >
            <ArrowLeft className={iconClass} />
          </button>
        )}
      </div>

      {/* Fan-out menu for left split */}
      <PaneControlFanButtons
        tabId={tabId}
        paneId={paneId}
        position="left"
        direction="row"
        insertBefore={true}
        hasMoveButton={canMoveLeft}
        isHovered={hoveredSplitButton === "left"}
        onVisibilityChange={(visible) =>
          handleVisibilityChange("left", visible)
        }
        onOpenPaneActions={onOpenPaneActions}
      />

      {/* Right buttons */}
      <div
        className={`absolute right-0 top-1/2 -translate-y-1/2 z-20 ${groupClasses.right}`}
      >
        <button
          className={buttonClass}
          onClick={() => handleSplit("row", false)}
          onMouseEnter={() => handleVisibilityChange("right", true)}
          onMouseLeave={() => handleVisibilityChange("right", false)}
          title="Split right (Alt+Shift+→)"
        >
          <SplitSquareHorizontal className={iconClass} />
        </button>

        {canMoveRight && (
          <button
            className={buttonClass}
            onClick={() => handleMove("right")}
            title="Move pane right (Alt+→)"
          >
            <ArrowRight className={iconClass} />
          </button>
        )}
      </div>

      {/* Fan-out menu for right split */}
      <PaneControlFanButtons
        tabId={tabId}
        paneId={paneId}
        position="right"
        direction="row"
        insertBefore={false}
        hasMoveButton={canMoveRight}
        isHovered={hoveredSplitButton === "right"}
        onVisibilityChange={(visible) =>
          handleVisibilityChange("right", visible)
        }
        onOpenPaneActions={onOpenPaneActions}
      />
    </div>
  );
}
