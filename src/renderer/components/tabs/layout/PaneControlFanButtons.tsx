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

  // Shared constants
  const BUTTON_RADIUS = 48;
  const SEMICIRCLE_RADIUS = 60;
  const MIN_DISTANCE = 30;

  // Calculate offset for move button - wrapper centers on split button
  const offset = hasMoveButton ? "calc(50% - 16px)" : "50%";

  if (!isVisible) return null;

  const buttonClass =
    "flex items-center justify-center w-8 h-8 rounded-none text-white hover:bg-blue-500/80 transition-colors cursor-pointer";
  const iconClass = "w-4 h-4 text-white";

  // Get the starting angle for the 180° arc based on position
  const getStartAngle = () => {
    switch (position) {
      case "top": return 180;
      case "bottom": return 0;
      case "left": return 90;
      case "right": return -90;
    }
  };

  // Calculate fan-out button positions
  const getFanButtonPosition = (index: number) => {
    const buttonCount = PANE_TYPES.length;

    // Reduce arc angle when there's a move button to avoid overlap
    const arcAngle = hasMoveButton ? 150 : 180;
    const angleStep = arcAngle / (buttonCount - 1);

    // Shift the arc away from the move button
    // Move button is always on the "inside" (closer to center of pane group)
    // For bottom/left: shift away (positive offset)
    // For top/right: no offset (arc starts at beginning)
    let angleOffset = 0;
    if (hasMoveButton) {
      const unusedAngle = 180 - arcAngle;
      angleOffset = (position === "bottom" || position === "left") ? unusedAngle : 0;
    }
    const angle = (getStartAngle() + angleOffset + angleStep * index) * (Math.PI / 180);

    const x = Math.cos(angle) * BUTTON_RADIUS;
    const y = Math.sin(angle) * BUTTON_RADIUS;

    // When there's a move button, the buttons are positioned relative to the wrapper
    // which is already offset, so we don't need additional offset here
    switch (position) {
      case "top":
        return {
          left: `calc(50% + ${x}px)`,
          top: `${-y + MIN_DISTANCE}px`,
        };
      case "bottom":
        return {
          left: `calc(50% + ${x}px)`,
          bottom: `${y}px`,
        };
      case "left":
        return {
          left: `${-x + MIN_DISTANCE}px`,
          top: `calc(50% + ${y}px)`,
        };
      case "right":
        return {
          right: `${x}px`,
          top: `calc(50% + ${y}px)`,
        };
    }
  };

  // Calculate wrapper positioning (centers on the split button)
  const getWrapperStyle = () => {
    switch (position) {
      case "top":
        return { top: 0, left: offset, transform: "translateX(-50%)" };
      case "bottom":
        return { bottom: 0, left: offset, transform: "translateX(-50%)" };
      case "left":
        return { left: 0, top: offset, transform: "translateY(-50%)" };
      case "right":
        return { right: 0, top: offset, transform: "translateY(-50%)" };
    }
  };

  // Calculate semicircle hover area
  // Offset by button size to avoid covering the split button
  const BUTTON_SIZE = 32; // Split button is 32px (w-8)

  const getSemicircleStyle = () => {
    const horizontalStyle = {
      width: `${SEMICIRCLE_RADIUS * 2}px`,
      height: `${SEMICIRCLE_RADIUS}px`,
      left: "50%",
      transform: "translateX(-50%)",
    };

    const verticalStyle = {
      width: `${SEMICIRCLE_RADIUS}px`,
      height: `${SEMICIRCLE_RADIUS * 2}px`,
      top: "50%",
      transform: "translateY(-50%)",
    };

    switch (position) {
      case "top":
        return {
          ...horizontalStyle,
          top: BUTTON_SIZE,
          clipPath: "ellipse(100% 100% at 50% 0%)",
        };
      case "bottom":
        return {
          ...horizontalStyle,
          bottom: BUTTON_SIZE,
          clipPath: "ellipse(100% 100% at 50% 100%)",
        };
      case "left":
        return {
          ...verticalStyle,
          left: BUTTON_SIZE,
          clipPath: "ellipse(100% 100% at 0% 50%)",
        };
      case "right":
        return {
          ...verticalStyle,
          right: BUTTON_SIZE,
          clipPath: "ellipse(100% 100% at 100% 50%)",
        };
    }
  };

  return (
    <div
      className="absolute pointer-events-none z-20"
      style={getWrapperStyle()}
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
