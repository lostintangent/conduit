import { TerminalPane } from "@/components/panes/terminal/TerminalPane";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  HyperTerminal as HyperTerminalType,
  HyperTerminalPosition,
} from "@shared/types";
import { ArrowUpRight, Maximize2, Minus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// Constants for overlay dimensions and positioning
const OVERLAY_WIDTH = 400;
const OVERLAY_HEIGHT = 300;
const DEFAULT_MARGIN = 16;
const POSITION_OFFSET = 32;
const POSITION_STORAGE_KEY = "lastHyperTerminalPosition";

type HyperTerminalProps = {
  terminal: HyperTerminalType;
  index: number;
  hidden?: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onOpenAsTab: () => void;
  onPositionChange: (position: HyperTerminalPosition) => void;
};

type ToolbarButtonProps = {
  icon: React.ReactNode;
  onClick: () => void;
  tooltip: string;
};

function ToolbarButton({ icon, onClick, tooltip }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="rounded-md p-1 transition hover:bg-muted"
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

const validatePosition = (pos: any): pos is HyperTerminalPosition => {
  return (
    typeof pos === "object" &&
    pos !== null &&
    typeof pos.x === "number" &&
    typeof pos.y === "number" &&
    !isNaN(pos.x) &&
    !isNaN(pos.y)
  );
};

const constrainPosition = (
  pos: HyperTerminalPosition,
): HyperTerminalPosition => {
  const maxX = window.innerWidth - OVERLAY_WIDTH;
  const maxY = window.innerHeight - OVERLAY_HEIGHT;

  return {
    x: Math.max(0, Math.min(pos.x, maxX)),
    y: Math.max(0, Math.min(pos.y, maxY)),
  };
};

const getInitialPosition = (index: number): HyperTerminalPosition => {
  const offset = index * POSITION_OFFSET;

  try {
    const saved = localStorage.getItem(POSITION_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (validatePosition(parsed)) {
        // Apply offset for multiple terminals and constrain to viewport
        return constrainPosition({
          x: parsed.x + offset,
          y: parsed.y + offset,
        });
      }
    }
  } catch (e) {
    console.error("Failed to load terminal position from localStorage", e);
  }
  // Default position: bottom-left with offset
  return constrainPosition({
    x: DEFAULT_MARGIN + offset,
    y: window.innerHeight - OVERLAY_HEIGHT - DEFAULT_MARGIN + offset,
  });
};

const savePosition = (pos: HyperTerminalPosition) => {
  try {
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(pos));
  } catch (e) {
    console.error("Failed to save terminal position to localStorage", e);
  }
};

export function HyperTerminal({
  terminal,
  index,
  hidden,
  onClose,
  onMinimize,
  onMaximize,
  onOpenAsTab,
  onPositionChange,
}: HyperTerminalProps) {
  const { terminalId, paneId, cwd, position: savedPosition } = terminal;
  const [position, setPosition] = useState(() =>
    savedPosition
      ? constrainPosition(savedPosition)
      : getInitialPosition(index),
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const positionRef = useRef(position);

  // Keep ref in sync with state
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Don't start dragging if clicking on buttons
      if ((e.target as HTMLElement).closest("button")) {
        return;
      }

      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
    },
    [position],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      const newX = e.clientX - dragOffset.current.x;
      const newY = e.clientY - dragOffset.current.y;

      const newPosition = constrainPosition({ x: newX, y: newY });
      setPosition(newPosition);
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    // Save the latest position from ref to avoid stale closure
    savePosition(positionRef.current);
    onPositionChange(positionRef.current);
  }, [onPositionChange]);

  // Set up global mouse event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      className={`fixed z-[70] rounded-lg overflow-hidden shadow-2xl border border-border bg-background ${hidden ? "hidden" : ""}`}
      style={{
        width: `${OVERLAY_WIDTH}px`,
        height: `${OVERLAY_HEIGHT}px`,
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? "grabbing" : "default",
      }}
    >
      <div className="flex flex-col w-full h-full">
        <div
          className="flex items-center justify-between bg-elevated backdrop-blur px-3 py-2 border-b border-border cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center">
            <div className="flex items-center gap-2 group/buttons">
              <button
                type="button"
                onClick={onClose}
                className="w-3 h-3 rounded-full bg-[#FF5F56] hover:bg-[#FF4136] transition-colors flex items-center justify-center"
                aria-label="Close"
              >
                <X
                  size={8}
                  strokeWidth={2.5}
                  className="text-black/60 opacity-0 group-hover/buttons:opacity-100 transition-opacity"
                />
              </button>
              <button
                type="button"
                onClick={onMinimize}
                className="w-3 h-3 rounded-full bg-[#FFBD2E] hover:bg-[#E5A829] transition-colors flex items-center justify-center"
                aria-label="Minimize"
              >
                <Minus
                  size={8}
                  strokeWidth={2.5}
                  className="text-black/60 opacity-0 group-hover/buttons:opacity-100 transition-opacity"
                />
              </button>
              <button
                type="button"
                onClick={onMaximize}
                className="w-3 h-3 rounded-full bg-[#27C93F] hover:bg-[#1DB954] transition-colors flex items-center justify-center"
                aria-label="Maximize"
              >
                <Maximize2
                  size={6}
                  strokeWidth={2.5}
                  className="text-black/60 opacity-0 group-hover/buttons:opacity-100 transition-opacity"
                />
              </button>
            </div>
          </div>
          <ToolbarButton
            icon={<ArrowUpRight size={14} />}
            onClick={onOpenAsTab}
            tooltip="Open in tab"
          />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden px-0.5">
          <TerminalPane
            pane={{
              id: paneId,
              type: "terminal",
              sessionId: terminalId,
              cwd,
              title: "",
            }}
            isActive
            fontSize={11}
          />
        </div>
      </div>
    </div>
  );
}
