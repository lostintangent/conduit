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
  const handleSplit = (direction: SplitDirection, insertBefore: boolean) => {
    void splitPane(tabId, paneId, direction, insertBefore);
  };

  const handleMove = (direction: PaneDirection) => {
    movePane(tabId, paneId, direction);
  };

  const handleClose = () => {
    closePane(tabId, paneId);
  };

  const handleMoveToNewTab = () => {
    movePaneToTab(tabId, paneId);
  };

  const buttonClass =
    "flex items-center justify-center w-8 h-8 bg-black/60 hover:bg-blue-500/80 border border-white/20 rounded transition-colors cursor-pointer backdrop-blur-sm";
  const iconClass = "w-4 h-4 text-white";

  // Show move to new tab button if there are multiple panes in the tab
  const showMoveToNewTab = !isOnlyPane;
  // Show close button if there are multiple panes OR multiple tabs
  const showClose = !isOnlyPane || !isOnlyTab;

  return (
    <>
      {/* Center buttons - Move to new tab and Close */}
      {(showMoveToNewTab || showClose) && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-1 z-10">
          {showMoveToNewTab && (
            <button
              className={buttonClass}
              onClick={handleMoveToNewTab}
              title="Move pane to new tab (Alt+T)"
            >
              <CornerUpRight className={iconClass} />
            </button>
          )}
          {showClose && (
            <button
              className={buttonClass}
              onClick={handleClose}
              title="Close pane (Alt+W)"
            >
              <X className={iconClass} />
            </button>
          )}
        </div>
      )}

      {/* Top buttons */}
      <div className="absolute top-1 left-1/2 -translate-x-1/2 flex gap-1 z-10">
        <button
          className={buttonClass}
          onClick={() => handleSplit("column", true)}
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

      {/* Bottom buttons */}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1 z-10">
        <button
          className={buttonClass}
          onClick={() => handleSplit("column", false)}
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

      {/* Left buttons */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-10">
        <button
          className={buttonClass}
          onClick={() => handleSplit("row", true)}
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

      {/* Right buttons */}
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-10">
        <button
          className={buttonClass}
          onClick={() => handleSplit("row", false)}
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
    </>
  );
}
