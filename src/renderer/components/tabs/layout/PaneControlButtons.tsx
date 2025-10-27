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
  SplitSquareHorizontal,
  SplitSquareVertical,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PaneControlFanButtons } from "./PaneControlFanButtons";

interface PaneControlButtonsProps {
  tabId: string;
  paneId: string;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isOnlyPane: boolean;
  isOnlyTab: boolean;
}

type SplitButtonPosition = "top" | "bottom" | "left" | "right" | null;

export function PaneControlButtons({
  tabId,
  paneId,
  canMoveLeft,
  canMoveRight,
  canMoveUp,
  canMoveDown,
  isOnlyPane,
  isOnlyTab,
}: PaneControlButtonsProps) {
  const [hoveredSplitButton, setHoveredSplitButton] =
    useState<SplitButtonPosition>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSplit = (direction: SplitDirection, insertBefore: boolean) => {
    void splitPane(tabId, paneId, direction, insertBefore);
  };

  const handleMove = (direction: PaneDirection) => {
    movePane(tabId, paneId, direction);
  };

  const handleMouseEnter = (position: SplitButtonPosition) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setHoveredSplitButton(position);
  };

  const handleMouseLeave = () => {
    // Delay hiding to allow moving to the fanned buttons
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredSplitButton(null);
    }, 350);
  };

  const handleFanMenuMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const groupBaseClass =
    "bg-black/60 border border-blueprint border-dashed rounded-lg backdrop-blur-sm overflow-hidden";

  const dividerColorClass = "divide-blueprint";

  const groupClasses = {
    center: `${groupBaseClass} flex divide-x ${dividerColorClass} divide-dashed`,
    top: `${groupBaseClass} flex divide-x ${dividerColorClass} divide-dashed rounded-t-none border-t-0`,
    bottom: `${groupBaseClass} flex divide-x ${dividerColorClass} rounded-b-none divide-dashed border-b-0`,
    left: `${groupBaseClass} flex flex-col divide-y ${dividerColorClass} rounded-l-none divide-dashed border-l-0`,
    right: `${groupBaseClass} flex flex-col divide-y ${dividerColorClass} rounded-r-none divide-dashed border-r-0`,
  } as const;

  const buttonClass =
    "flex items-center justify-center w-8 h-8 rounded-none text-white hover:bg-blue-500/80 transition-colors cursor-pointer";

  const iconClass = "w-4 h-4 text-white";

  // Show move to new tab button if there are multiple panes in the tab
  const showMoveToNewTab = !isOnlyPane;

  // Show close button if there are multiple panes OR multiple tabs
  const showClose = !isOnlyPane || !isOnlyTab;

  return (
    <>
      {/* Center buttons (Move to new tab and Close) */}
      {(showMoveToNewTab || showClose) && (
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 ${groupClasses.center}`}
        >
          {showMoveToNewTab && (
            <button
              className={buttonClass}
              onClick={() => movePaneToTab(tabId, paneId)}
              title="Move pane to new tab (Alt+T)"
            >
              <CornerUpRight className={iconClass} />
            </button>
          )}
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
      )}

      {/* Top buttons */}
      <div
        className={`absolute top-0 left-1/2 -translate-x-1/2 z-10 ${groupClasses.top}`}
      >
        <button
          className={buttonClass}
          onClick={() => handleSplit("column", true)}
          onMouseEnter={() => handleMouseEnter("top")}
          onMouseLeave={handleMouseLeave}
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
        isVisible={hoveredSplitButton === "top"}
        onMouseEnter={handleFanMenuMouseEnter}
        onMouseLeave={handleMouseLeave}
      />

      {/* Bottom buttons */}
      <div
        className={`absolute bottom-0 left-1/2 -translate-x-1/2 z-10 ${groupClasses.bottom}`}
      >
        <button
          className={buttonClass}
          onClick={() => handleSplit("column", false)}
          onMouseEnter={() => handleMouseEnter("bottom")}
          onMouseLeave={handleMouseLeave}
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
        isVisible={hoveredSplitButton === "bottom"}
        onMouseEnter={handleFanMenuMouseEnter}
        onMouseLeave={handleMouseLeave}
      />

      {/* Left buttons */}
      <div
        className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 ${groupClasses.left}`}
      >
        <button
          className={buttonClass}
          onClick={() => handleSplit("row", true)}
          onMouseEnter={() => handleMouseEnter("left")}
          onMouseLeave={handleMouseLeave}
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
        isVisible={hoveredSplitButton === "left"}
        onMouseEnter={handleFanMenuMouseEnter}
        onMouseLeave={handleMouseLeave}
      />

      {/* Right buttons */}
      <div
        className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 ${groupClasses.right}`}
      >
        <button
          className={buttonClass}
          onClick={() => handleSplit("row", false)}
          onMouseEnter={() => handleMouseEnter("right")}
          onMouseLeave={handleMouseLeave}
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
        isVisible={hoveredSplitButton === "right"}
        onMouseEnter={handleFanMenuMouseEnter}
        onMouseLeave={handleMouseLeave}
      />
    </>
  );
}
