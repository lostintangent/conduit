import { openWebViewPane, splitPane } from "@/store/actions/pane";
import type { SplitDirection } from "@/types";
import {
  FileCode,
  GitBranch,
  Globe,
  Terminal,
  Zap,
} from "lucide-react";

const PANE_TYPES = [
  { id: "source-control", label: "Source Control", icon: GitBranch },
  { id: "editor", label: "Editor", icon: FileCode },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "webview", label: "Web View", icon: Globe },
  { id: "command", label: "Command", icon: Zap },
] as const;

interface PaneControlFanButtonsProps {
  tabId: string;
  paneId: string;
  position: "top" | "bottom" | "left" | "right";
  direction: SplitDirection;
  insertBefore: boolean;
  hasMoveButton: boolean;
  isVisible: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function PaneControlFanButtons({
  tabId,
  paneId,
  position,
  direction,
  insertBefore,
  hasMoveButton,
  isVisible,
  onMouseEnter,
  onMouseLeave,
}: PaneControlFanButtonsProps) {
  const handlePaneTypeClick = async (paneTypeId: string) => {
    const api = window.conduit;

    switch (paneTypeId) {
      case "terminal":
        // Default terminal
        await splitPane(tabId, paneId, direction, insertBefore);
        break;

      case "webview":
        // Open web view - could prompt for URL, for now use a default
        openWebViewPane(tabId, paneId, "https://google.com");
        break;

      case "source-control": {
        // Open terminal and run lazygit
        const newPane = await splitPane(tabId, paneId, direction, insertBefore);
        if (newPane?.sessionId) {
          // Send the lazygit command followed by enter
          await api.sendKeypress(newPane.sessionId, "lazygit\r");
        }
        break;
      }

      case "editor":
      case "command":
      default:
        // Default to terminal for now
        await splitPane(tabId, paneId, direction, insertBefore);
        break;
    }
  };

  // Calculate fan-out button positions
  const getFanButtonPosition = (index: number) => {
    const radius = 48; // Distance from center
    const buttonCount = PANE_TYPES.length;
    const minDistance = 30; // Minimum distance from the split button to keep buttons visible

    // Determine the arc center offset based on whether move button exists
    let centerOffset = 0;
    if (hasMoveButton) {
      // If there's a move button, the split button is at index 0, so offset accordingly
      centerOffset = 16; // Half of button width (32px / 2)
    }

    // Calculate angle for each button in a 180° arc
    // Start at one end and end at the other
    const startAngle =
      position === "top" ? 180 : position === "bottom" ? 0 : position === "left" ? 90 : -90;
    const angleStep = 180 / (buttonCount - 1);
    const angle = (startAngle + angleStep * index) * (Math.PI / 180);

    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;

    // Adjust positioning based on direction
    // For top/left, we add minDistance to ensure buttons don't go off-screen
    // For bottom/right, the CSS properties naturally keep them on-screen
    switch (position) {
      case "top":
        return {
          left: `calc(50% + ${x - centerOffset}px)`,
          top: `${-y + minDistance}px`,
        };
      case "bottom":
        return {
          left: `calc(50% + ${x - centerOffset}px)`,
          bottom: `${y}px`,
        };
      case "left":
        return {
          left: `${-x + minDistance}px`,
          top: `calc(50% + ${y - centerOffset}px)`,
        };
      case "right":
        return {
          right: `${x}px`,
          top: `calc(50% + ${y - centerOffset}px)`,
        };
      default:
        return {};
    }
  };

  if (!isVisible) return null;

  const buttonClass =
    "flex items-center justify-center w-8 h-8 rounded-none text-white hover:bg-blue-500/80 transition-colors cursor-pointer";
  const iconClass = "w-4 h-4 text-white";

  // Calculate semicircle background dimensions
  const getSemicircleStyle = () => {
    const radius = 60; // Slightly larger than button radius to encompass all buttons

    switch (position) {
      case "top":
        return {
          width: `${radius * 2}px`,
          height: `${radius}px`,
          left: "50%",
          top: "0",
          transform: "translateX(-50%)",
          clipPath: "ellipse(100% 100% at 50% 100%)", // Semicircle opening downward
        };
      case "bottom":
        return {
          width: `${radius * 2}px`,
          height: `${radius}px`,
          left: "50%",
          bottom: "0",
          transform: "translateX(-50%)",
          clipPath: "ellipse(100% 100% at 50% 0%)", // Semicircle opening upward
        };
      case "left":
        return {
          width: `${radius}px`,
          height: `${radius * 2}px`,
          left: "0",
          top: "50%",
          transform: "translateY(-50%)",
          clipPath: "ellipse(100% 100% at 100% 50%)", // Semicircle opening rightward
        };
      case "right":
        return {
          width: `${radius}px`,
          height: `${radius * 2}px`,
          right: "0",
          top: "50%",
          transform: "translateY(-50%)",
          clipPath: "ellipse(100% 100% at 0% 50%)", // Semicircle opening leftward
        };
      default:
        return {};
    }
  };

  return (
    <div
      className="absolute pointer-events-none z-20"
      style={{ left: 0, top: 0 }}
    >
      {/* Invisible semicircle hover area */}
      <div
        className="absolute pointer-events-auto"
        style={getSemicircleStyle()}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />

      {/* Fan-out buttons */}
      {PANE_TYPES.map((paneType, index) => {
        const pos = getFanButtonPosition(index);
        const Icon = paneType.icon;

        return (
          <button
            key={paneType.id}
            className={`${buttonClass} absolute pointer-events-auto bg-black/60 border border-blueprint border-dashed rounded-lg backdrop-blur-sm -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ease-out opacity-0 animate-fan-in`}
            style={{
              ...pos,
              animationDelay: `${index * 30}ms`,
              animationFillMode: "forwards",
            }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onClick={() => void handlePaneTypeClick(paneType.id)}
            title={`Split ${position} - ${paneType.label}`}
          >
            <Icon className={iconClass} />
          </button>
        );
      })}
    </div>
  );
}
