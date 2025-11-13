import {
  PaneActionIcon,
  isBrowserConfig,
  isEditorConfig,
  isTerminalConfig,
  useEnabledPaneActions,
} from "@/commands/paneActions";
import type { Action } from "@/commands/paneActions/core/types";
import { MAX_ACTIONS } from "@/commands/paneActions/core/types";
import { PreCommandRegistry } from "@/commands/preCommands/registry";
import { enqueueNotification } from "@/store/actions/notifications";
import {
  openEditorPane,
  openWebViewPane,
  splitPane,
} from "@/store/actions/pane";
import { tabsAtom } from "@/store/atoms";
import type { SplitDirection } from "@/types";
import { useAtomValue } from "jotai";
import { Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type SplitButtonPosition = "top" | "bottom" | "left" | "right";

interface PaneControlFanButtonsProps {
  tabId: string;
  paneId: string;
  position: SplitButtonPosition;
  direction: SplitDirection;
  insertBefore: boolean;
  hasMoveButton: boolean;
  isHovered: boolean;
  onVisibilityChange: (visible: boolean) => void;
  onOpenPaneActions?: () => void;
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
  onOpenPaneActions,
}: PaneControlFanButtonsProps) {
  const [isVisible, setIsVisible] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tabs = useAtomValue(tabsAtom);

  // Get pane actions
  const paneActions = useEnabledPaneActions();

  // Create an array with pane actions and placeholders (max 5 total)
  const actions: Array<Action | null> = [
    ...paneActions,
    ...Array(Math.max(0, MAX_ACTIONS - paneActions.length)).fill(null),
  ];

  // Get the current pane to determine its cwd
  const currentPane = tabs.find((tab) => tab.id === tabId)?.panes[paneId];

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
    // Only maintain visibility if fan is already visible
    // This prevents the semicircle from triggering initial opening
    if (!isVisible) {
      return;
    }

    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    // Maintain visible state
    setIsVisible(true);
    // Notify parent we're still hovering
    onVisibilityChange(true);
  };

  const handleMouseLeave = () => {
    // Notify parent immediately, let parent manage timeout
    onVisibilityChange(false);
  };

  const handleActionClick = async (action: Action) => {
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

    // Execute action based on pane type, using existing logic patterns
    switch (action.paneType) {
      case "terminal": {
        if (isTerminalConfig(action.config)) {
          const terminalConfig = action.config;
          const terminalCwd = terminalConfig.cwd || cwd;

          // Start with base options including any cloud terminal config from pane action
          let paneOptions: any = {
            terminalOptions: {
              ...(terminalCwd ? { cwd: terminalCwd } : {}),
              ...(terminalConfig.isRemoteVM !== undefined
                ? { isRemoteVM: terminalConfig.isRemoteVM }
                : {}),
              ...(terminalConfig.vmImageId
                ? { vmImageId: terminalConfig.vmImageId }
                : {}),
              ...(terminalConfig.vmLabels
                ? { vmLabels: terminalConfig.vmLabels }
                : {}),
              ...(terminalConfig.githubRepo
                ? { githubRepo: terminalConfig.githubRepo }
                : {}),
            },
          };

          // Execute pre-command if specified
          if (terminalConfig.preCommandId) {
            const registry = PreCommandRegistry.getInstance();
            const result = await registry.execute(terminalConfig.preCommandId, {
              ...terminalConfig,
              cwd: terminalCwd,
            });

            if (!result.success) {
              // Show error notification and abort
              enqueueNotification({
                kind: "error",
                message: `Pre-command failed: ${result.error}`,
                persistent: true,
              });
              return;
            }

            // Merge paneOptions from pre-command result
            // Pre-command options take precedence over pane action config
            if (result.paneOptions) {
              paneOptions = {
                ...paneOptions,
                ...result.paneOptions,
                terminalOptions: {
                  ...paneOptions.terminalOptions,
                  ...result.paneOptions.terminalOptions,
                },
              };
            }
          }

          // Create terminal pane with merged options
          const newPane = await splitPane(
            tabId,
            paneId,
            direction,
            insertBefore,
            paneOptions,
          );

          // If there's a command configured, send it
          if (newPane?.sessionId && terminalConfig.command) {
            setTimeout(() => {
              api.sendKeypress(
                newPane.sessionId,
                terminalConfig.command + "\r",
              );
            }, 100);
          }
        }
        break;
      }

      case "browser": {
        if (isBrowserConfig(action.config)) {
          const url = action.config.url || "https://google.com";
          openWebViewPane(tabId, paneId, url, direction, insertBefore);
        }
        break;
      }

      case "editor": {
        if (isEditorConfig(action.config)) {
          let editorCwd = action.config.cwd || cwd;

          if (!editorCwd) {
            // Fallback to home directory
            const homeDir = await api
              .getSettings()
              .then((s) => s.homeDirectory);
            editorCwd = homeDir || ".";
          }

          openEditorPane(tabId, paneId, editorCwd, direction, insertBefore);
        }
        break;
      }
    }
  };

  const handlePlaceholderClick = () => {
    if (onOpenPaneActions) {
      onOpenPaneActions();
    }
  };

  // Shared constants
  const BUTTON_RADIUS = 48;
  const MIN_DISTANCE = 30;

  // Calculate offset for move button - wrapper centers on split button
  const offset = hasMoveButton ? "calc(50% - 16px)" : "50%";

  const buttonClass =
    "flex items-center justify-center w-8 h-8 rounded-full text-white hover:bg-blue-500/80 transition-colors cursor-pointer";
  const iconClass = "w-4 h-4 text-white";

  // Get the starting angle for the 180° arc based on position
  const getStartAngle = () => {
    switch (position) {
      case "top":
        return 180;
      case "bottom":
        return 0;
      case "left":
        return 90;
      case "right":
        return -90;
    }
  };

  // Calculate fan-out button positions
  const getFanButtonPosition = (index: number) => {
    const buttonCount = actions.length;

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
      angleOffset =
        position === "bottom" || position === "left" ? unusedAngle : 0;
    }
    const angle =
      (getStartAngle() + angleOffset + angleStep * index) * (Math.PI / 180);

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
      {isVisible &&
        actions.map((action, index) => {
          const pos = getFanButtonPosition(index);

          // If action is null, render a placeholder button
          if (action === null) {
            return (
              <button
                key={`placeholder-${index}`}
                className={`${buttonClass} absolute pointer-events-auto bg-black/40 border border-gray-600 border-dashed rounded-full backdrop-blur-sm -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ease-out opacity-0 animate-fan-in`}
                style={{
                  ...pos,
                  animationDelay: `${index * 30}ms`,
                  animationFillMode: "forwards",
                }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onClick={handlePlaceholderClick}
                title="Configure pane actions"
              >
                <Settings className={`${iconClass} opacity-50`} />
              </button>
            );
          }

          // Render actual action button
          return (
            <button
              key={`action-${index}-${action.name}`}
              className={`${buttonClass} absolute pointer-events-auto bg-black/60 border border-accent border-dashed rounded-full backdrop-blur-sm -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ease-out opacity-0 animate-fan-in`}
              style={{
                ...pos,
                animationDelay: `${index * 30}ms`,
                animationFillMode: "forwards",
              }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              onClick={() => void handleActionClick(action)}
              title={`Split ${position} - ${action.name}`}
            >
              <PaneActionIcon iconId={action.icon} className={iconClass} />
            </button>
          );
        })}
    </div>
  );
}
