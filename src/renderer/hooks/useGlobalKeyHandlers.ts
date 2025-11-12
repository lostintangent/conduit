import {
  exitFocusMode,
  isFocusModeActive,
  navigateFocusedPane,
} from "@/store/actions/focusMode";
import {
  navigatePane,
  type PaneNavigationDirection,
} from "@/store/actions/paneNavigation";
import { focusTab } from "@/store/actions/tab";
import { activeTabAtom, applicationModeAtom, tabsAtom } from "@/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";

type UseGlobalKeyHandlersResult = {
  isCommandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
};

export const useGlobalKeyHandlers = (): UseGlobalKeyHandlersResult => {
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const tabs = useAtomValue(tabsAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const applicationMode = useAtomValue(applicationModeAtom);
  const setApplicationMode = useSetAtom(applicationModeAtom);

  const openCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true);
  }, []);

  const closeCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false);
  }, []);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isFocusModeActive()) {
          event.preventDefault();
          exitFocusMode();
          return;
        }

        if (applicationMode === "overview") {
          event.preventDefault();
          setApplicationMode("normal");
          return;
        }

        if (applicationMode === "design") {
          event.preventDefault();
          setApplicationMode("normal");
          return;
        }
      }

      const key = event.key.toLowerCase();

      // NOTE: Cmd+Shift+P is now handled by the command system (VIEW_SHOW_COMMAND_PALETTE)
      // NOTE: Cmd+Shift+F is now handled by the command system (VIEW_TOGGLE_FOCUS_MODE)
      // NOTE: Cmd+D is now handled by the command system (VIEW_TOGGLE_DESIGN_MODE)
      // See: src/renderer/commands/applicationCommands.ts

      if (isCommandPaletteOpen) {
        return;
      }

      if (!event.metaKey) {
        return;
      }

      // NOTE: Cmd+Alt+T is now handled by the command system (PANE_MOVE_TO_TAB)
      // NOTE: Cmd+Alt+Arrow is now handled by the command system (PANE_MOVE_*)
      // NOTE: Cmd+Shift+Arrow is now handled by the command system (PANE_SPLIT_*)
      // NOTE: Cmd+Shift+Ctrl+Arrow is now handled by the command system (PANE_SPLIT_*_AGENT)
      // See: src/renderer/commands/applicationCommands.ts

      const directionKeyMap: Record<string, PaneNavigationDirection> = {
        arrowleft: "left",
        arrowright: "right",
        arrowup: "up",
        arrowdown: "down",
      };

      // Cmd+Arrow: Navigate pane (without modifiers)
      const direction = directionKeyMap[key];
      if (direction && !event.altKey && !event.shiftKey) {
        if (activeTab && activeTab.activePaneId) {
          event.preventDefault();
          if (isFocusModeActive()) {
            const focusModeDirectionMap: Record<
              PaneNavigationDirection,
              "next" | "prev"
            > = {
              left: "prev",
              up: "prev",
              right: "next",
              down: "next",
            };
            navigateFocusedPane(focusModeDirectionMap[direction]);
          } else {
            navigatePane(activeTab.id, activeTab.activePaneId, direction);
          }
        }
        return;
      }

      if (event.shiftKey) {
        return;
      }

      // NOTE: Cmd+T is now handled by the command system (TAB_NEW)
      // See: src/renderer/commands/applicationCommands.ts

      // Cmd+1, Cmd+2, ... Cmd+9: Focus tab by index
      const tabNumber = Number.parseInt(key, 10);
      if (Number.isNaN(tabNumber) || tabNumber < 1) {
        return;
      }

      const targetIndex = Math.min(tabNumber, tabs.length) - 1;
      const targetTab = tabs[targetIndex];
      if (targetTab) {
        event.preventDefault();
        focusTab(targetTab.id);
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [
    activeTab,
    focusTab,
    isCommandPaletteOpen,
    tabs,
    applicationMode,
    setApplicationMode,
  ]);

  return {
    isCommandPaletteOpen,
    openCommandPalette,
    closeCommandPalette,
  };
};
