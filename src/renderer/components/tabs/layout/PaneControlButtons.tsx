import { movePane, splitPane } from "@/store/actions/pane";
import type { SplitDirection } from "@/types";
import type { PaneDirection } from "@/utils/layout";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  SplitSquareHorizontal,
  SplitSquareVertical,
  X,
} from "lucide-react";
import React from "react";

interface PaneControlButtonsProps {
  tabId: string;
  paneId: string;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onClose: (tabId: string, paneId: string) => void;
}

export function PaneControlButtons({
  tabId,
  paneId,
  canMoveLeft,
  canMoveRight,
  canMoveUp,
  canMoveDown,
  onClose,
}: PaneControlButtonsProps) {
  const handleSplit = (direction: SplitDirection, insertBefore: boolean) => {
    void splitPane(tabId, paneId, direction, insertBefore);
  };

  const handleMove = (direction: PaneDirection) => {
    movePane(tabId, paneId, direction);
  };

  const handleClose = () => {
    onClose(tabId, paneId);
  };

  const buttonClass =
    "flex items-center justify-center w-8 h-8 bg-black/60 hover:bg-blue-500/80 border border-white/20 rounded transition-colors cursor-pointer backdrop-blur-sm";
  const iconClass = "w-4 h-4 text-white";

  return (
    <>
      {/* Center close button */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <button
          className={buttonClass}
          onClick={handleClose}
          title="Close pane"
        >
          <X className={iconClass} />
        </button>
      </div>

      {/* Top buttons */}
      <div className="absolute top-1 left-1/2 -translate-x-1/2 flex gap-1 z-10">
        <button
          className={buttonClass}
          onClick={() => handleSplit("column", true)}
          title="Split above"
        >
          <SplitSquareVertical className={iconClass} />
        </button>
        {canMoveUp && (
          <button
            className={buttonClass}
            onClick={() => handleMove("up")}
            title="Move up"
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
          title="Split below"
        >
          <SplitSquareVertical className={iconClass} />
        </button>
        {canMoveDown && (
          <button
            className={buttonClass}
            onClick={() => handleMove("down")}
            title="Move down"
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
          title="Split left"
        >
          <SplitSquareHorizontal className={iconClass} />
        </button>
        {canMoveLeft && (
          <button
            className={buttonClass}
            onClick={() => handleMove("left")}
            title="Move left"
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
          title="Split right"
        >
          <SplitSquareHorizontal className={iconClass} />
        </button>
        {canMoveRight && (
          <button
            className={buttonClass}
            onClick={() => handleMove("right")}
            title="Move right"
          >
            <ArrowRight className={iconClass} />
          </button>
        )}
      </div>
    </>
  );
}
