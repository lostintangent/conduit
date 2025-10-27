import { openEditorPane, openWebViewPane, splitPane } from "@/store/actions/pane";
import { tabsAtom } from "@/store/atoms";
import type { SplitDirection } from "@/types";
import {
  FileCode,
  GitBranch,
  Globe,
  Terminal,
  Zap,
} from "lucide-react";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";

export type SplitButtonPosition = "top" | "bottom" | "left" | "right";

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
  position: SplitButtonPosition;
  direction: SplitDirection;
  insertBefore: boolean;
  hasMoveButton: boolean;
  isHovered: boolean;
  onVisibilityChange: (visible: boolean) => void;
}

export function PaneControlFanButtons({
  tabId,
  paneId,
  position,
  direction,
  insertBefore,
  hasMoveButton,
  isHovered,
  onVisibilityChange,
}: PaneControlFanButtonsProps) {
  const [isVisible, setIsVisible] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tabs = useAtomValue(tabsAtom);
  
  // Get the current pane to determine its cwd
  const currentPane = tabs
    .find((tab) => tab.id === tabId)
    ?.panes[paneId];

  // Show/hide fan buttons based on hover state with delay
  useEffect(() => {
    if (isHovered) {
      // Clear any pending hide timeout
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      setIsVisible(true);
    } else if (isVisible) {
      // Hide immediately - parent will manage the delay
      setIsVisible(false);
    }

    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
    };
  }, [isHovered, isVisible]);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    // Always update state to visible
    setIsVisible(true);
    // Always notify parent we're hovering
    onVisibilityChange(true);
  };

  const handleMouseLeave = () => {
    // Notify parent immediately, let parent manage timeout
    onVisibilityChange(false);
  };
  const handlePaneTypeClick = async (paneTypeId: string) => {
    const api = window.conduit;

    // Get cwd from current pane if available
    let cwd: string | undefined;
    if (currentPane) {
      if (currentPane.type === "terminal") {
        cwd = currentPane.cwd ?? undefined;
      } else if (currentPane.type === "editor") {
        cwd = currentPane.cwd;
      }
    }

    switch (paneTypeId) {
      case "terminal":
        // Default terminal
        await splitPane(tabId, paneId, direction, insertBefore);
        break;

      case "webview":
        // Open web view - could prompt for URL, for now use a default
        openWebViewPane(tabId, paneId, "https://google.com", direction, insertBefore);
        break;

      case "editor":
        // Open editor pane with file tree
        if (cwd) {
          openEditorPane(tabId, paneId, cwd, direction, insertBefore);
        } else {
          // Fallback to home directory or create a terminal to get cwd
          const homeDir = await api.getSettings().then(s => s.homeDirectory);
          openEditorPane(tabId, paneId, homeDir || ".", direction, insertBefore);
        }
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

      case "command":
      default:
        // Default to terminal for now
        await splitPane(tabId, paneId, direction, insertBefore);
        break;
    }
  };

  // Shared constants
  const BUTTON_RADIUS = 48;
  const FAN_BUTTON_SIZE = 32; // w-8 = 32px
  // Semicircle needs to extend beyond button centers to encompass the full buttons
  const SEMICIRCLE_RADIUS = BUTTON_RADIUS + FAN_BUTTON_SIZE / 2; // 48 + 16 = 64px
  const MIN_DISTANCE = 30;

  // Calculate offset for move button - wrapper centers on split button
  const offset = hasMoveButton ? "calc(50% - 16px)" : "50%";

  const buttonClass =
    "flex items-center justify-center w-8 h-8 rounded-full text-white hover:bg-blue-500/80 transition-colors cursor-pointer";
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
  // Extends from the button edge to cover the area where fan buttons appear
  // Uses wider, flatter ellipse to create proper arc shape that encompasses fan buttons
  // Offset by 32px to start after the split button (avoids blocking button interactions)
  const SPLIT_BUTTON_SIZE = 32; // w-8 h-8 = 32px

  const getSemicircleStyle = () => {
    switch (position) {
      case "top":
        return {
          width: "135px",
          height: "75px",
          left: "50%",
          transform: "translateX(-50%)",
          top: SPLIT_BUTTON_SIZE,
          clipPath: "ellipse(50% 100% at 50% 0%)",
        };
      case "bottom":
        return {
          width: "135px",
          height: "75px",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: SPLIT_BUTTON_SIZE,
          clipPath: "ellipse(50% 100% at 50% 100%)",
        };
      case "left":
        return {
          width: "75px",
          height: "135px",
          top: "50%",
          transform: "translateY(-50%)",
          left: SPLIT_BUTTON_SIZE,
          clipPath: "ellipse(100% 50% at 0% 50%)",
        };
      case "right":
        return {
          width: "75px",
          height: "135px",
          top: "50%",
          transform: "translateY(-50%)",
          right: SPLIT_BUTTON_SIZE,
          clipPath: "ellipse(100% 50% at 100% 50%)",
        };
    }
  };

  return (
    <div
      className="absolute pointer-events-none z-30"
      style={getWrapperStyle()}
    >
      {/* Invisible semicircle hover area - always present to bridge hover from split button */}
      <div
        className="absolute pointer-events-auto"
        style={getSemicircleStyle()}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />

      {/* Fan-out buttons */}
      {isVisible && PANE_TYPES.map((paneType, index) => {
        const pos = getFanButtonPosition(index);
        const Icon = paneType.icon;

        return (
          <button
            key={paneType.id}
            className={`${buttonClass} absolute pointer-events-auto bg-black/60 border border-blueprint border-dashed rounded-full backdrop-blur-sm -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ease-out opacity-0 animate-fan-in`}
            style={{
              ...pos,
              animationDelay: `${index * 30}ms`,
              animationFillMode: "forwards",
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
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
