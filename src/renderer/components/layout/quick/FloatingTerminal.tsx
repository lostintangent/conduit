import { TerminalPane } from "@/components/panes/terminal/TerminalPane";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowUpRight, Maximize2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// Constants for overlay dimensions and positioning
const OVERLAY_WIDTH = 400;
const OVERLAY_HEIGHT = 300;
const DEFAULT_MARGIN = 16;
const POSITION_STORAGE_KEY = "floatingTerminalPosition";

type Position = { x: number; y: number };

type FloatingTerminalProps = {
  terminalId: string;
  paneId: string;
  cwd: string | null;
  onClose: () => void;
  onMaximize: () => void;
  onOpenAsTab: () => void;
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

const validatePosition = (pos: any): pos is Position => {
  return (
    typeof pos === "object" &&
    pos !== null &&
    typeof pos.x === "number" &&
    typeof pos.y === "number" &&
    !isNaN(pos.x) &&
    !isNaN(pos.y)
  );
};

const constrainPosition = (pos: Position): Position => {
  const maxX = window.innerWidth - OVERLAY_WIDTH;
  const maxY = window.innerHeight - OVERLAY_HEIGHT;

  return {
    x: Math.max(0, Math.min(pos.x, maxX)),
    y: Math.max(0, Math.min(pos.y, maxY)),
  };
};

const getInitialPosition = (): Position => {
  try {
    const saved = localStorage.getItem(POSITION_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (validatePosition(parsed)) {
        // Constrain to current viewport in case window was resized
        return constrainPosition(parsed);
      }
    }
  } catch (e) {
    console.error("Failed to load terminal position from localStorage", e);
  }
  // Default position: bottom-left
  return {
    x: DEFAULT_MARGIN,
    y: window.innerHeight - OVERLAY_HEIGHT - DEFAULT_MARGIN,
  };
};

const savePosition = (pos: Position) => {
  try {
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(pos));
  } catch (e) {
    console.error("Failed to save terminal position to localStorage", e);
  }
};

export function FloatingTerminal({
  terminalId,
  paneId,
  cwd,
  onClose,
  onMaximize,
  onOpenAsTab,
}: FloatingTerminalProps) {
  const [position, setPosition] = useState(getInitialPosition);
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
  }, []);

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
      className="fixed z-50 rounded-lg overflow-hidden shadow-2xl border border-border bg-background"
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
          <span className="text-sm font-medium select-none">
            Quick Terminal
          </span>
          <div className="flex items-center gap-1">
            <ToolbarButton
              icon={<Maximize2 size={14} />}
              onClick={onMaximize}
              tooltip="Maximize"
            />
            <ToolbarButton
              icon={<ArrowUpRight size={14} />}
              onClick={onOpenAsTab}
              tooltip="Open in tab"
            />
            <Separator
              orientation="vertical"
              className="h-5 bg-elevated-border mx-1"
            />
            <ToolbarButton
              icon={<X size={14} />}
              onClick={onClose}
              tooltip="Close"
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden px-0.5">
          <TerminalPane
            pane={{
              id: paneId,
              type: "terminal",
              sessionId: terminalId,
              cwd,
              processTitle: "",
            }}
            isActive
            fontSize={11}
          />
        </div>
      </div>
    </div>
  );
}
