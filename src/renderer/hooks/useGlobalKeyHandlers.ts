import {
  enterFocusMode,
  exitFocusMode,
  hasMultiplePanes,
  navigateFocusedPane,
} from "@/store/actions/focusMode";
import { movePane, splitPane } from "@/store/actions/pane";
import {
  navigatePane,
  type PaneNavigationDirection,
} from "@/store/actions/paneNavigation";
import { focusTab, movePaneToTab, openTab } from "@/store/actions/tab";
import { appPreferencesAtom, tabsAtom } from "@/store/atoms";
import type { SplitDirection } from "@/types";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";

type UseGlobalKeyHandlersResult = {
  isCommandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  showFocusModeInfo: boolean;
  setShowFocusModeInfo: (show: boolean) => void;
};

export const useGlobalKeyHandlers = (): UseGlobalKeyHandlersResult => {
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [showFocusModeInfo, setShowFocusModeInfo] = useState(false);
  const tabs = useAtomValue(tabsAtom);
  const [appPreferences, setAppPreferences] = useAtom(appPreferencesAtom);

  const openCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true);
  }, []);

  const closeCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false);
  }, []);

  const performSplit = useCallback(
    async (direction: SplitDirection, insertBefore = false) => {
      const activeTab = tabs.find((tab) => tab.isActive);
      if (!activeTab) {
        return;
      }

      await splitPane(
        activeTab.id,
        activeTab.activePaneId,
        direction,
        insertBefore
      );
      focusTab(activeTab.id);
    },
    [focusTab, splitPane, tabs]
  );

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (event.metaKey && event.shiftKey && !event.altKey && key === "p") {
        event.preventDefault();
        setCommandPaletteOpen((current) => !current);
        return;
      }

      if (isCommandPaletteOpen) {
        return;
      }

      // Cmd+Shift+F: Toggle focus mode
      if (event.metaKey && event.shiftKey && !event.altKey && key === "f") {
        event.preventDefault();

        const activeTab = tabs.find((tab) => tab.isActive);
        if (!activeTab) return;

        // Check if already in focus mode
        if (activeTab.focusedPaneId) {
          exitFocusMode(activeTab.id);
          return;
        }

        // Show info dialog on first use
        if (!appPreferences.hasSeenFocusModeInfo) {
          setShowFocusModeInfo(true);
          return;
        }

        // Check if multiple panes exist (is split)
        if (hasMultiplePanes(activeTab)) {
          // Enter focus mode on active pane
          enterFocusMode(activeTab.id, activeTab.activePaneId);
        } else {
          // Not split yet - perform vertical split
          void performSplit("column", false);
        }

        return;
      }

      // Cmd+Shift+D: Navigate to next pane (only in focus mode)
      if (event.metaKey && event.shiftKey && !event.altKey && key === "d") {
        const activeTab = tabs.find((tab) => tab.isActive);
        if (!activeTab || !activeTab.focusedPaneId) return;

        event.preventDefault();
        navigateFocusedPane(activeTab.id, "next");
        return;
      }

      // Cmd+Shift+G: Navigate to previous pane (only in focus mode)
      if (event.metaKey && event.shiftKey && !event.altKey && key === "g") {
        const activeTab = tabs.find((tab) => tab.isActive);
        if (!activeTab || !activeTab.focusedPaneId) return;

        event.preventDefault();
        navigateFocusedPane(activeTab.id, "prev");
        return;
      }

      if (!event.metaKey) {
        return;
      }

      if (event.altKey && key === "t") {
        const activeTab = tabs.find((tab) => tab.isActive);
        if (activeTab && activeTab.activePaneId) {
          event.preventDefault();
          movePaneToTab(activeTab.id, activeTab.activePaneId);
        }
        return;
      }

      const directionKeyMap: Record<string, PaneNavigationDirection> = {
        arrowleft: "left",
        arrowright: "right",
        arrowup: "up",
        arrowdown: "down",
      };

      const direction = directionKeyMap[key];
      if (direction) {
        const activeTab = tabs.find((tab) => tab.isActive);
        if (activeTab && activeTab.activePaneId) {
          event.preventDefault();
          if (event.altKey) {
            movePane(activeTab.id, activeTab.activePaneId, direction);
          } else if (event.shiftKey) {
            const splitConfig: Record<
              PaneNavigationDirection,
              { direction: SplitDirection; insertBefore: boolean }
            > = {
              left: { direction: "row", insertBefore: true },
              right: { direction: "row", insertBefore: false },
              up: { direction: "column", insertBefore: true },
              down: { direction: "column", insertBefore: false },
            };
            const config = splitConfig[direction];
            void performSplit(config.direction, config.insertBefore);
          } else {
            navigatePane(activeTab.id, activeTab.activePaneId, direction);
          }
        }
        return;
      }

      if (event.shiftKey) {
        return;
      }

      if (key === "t" && !event.altKey) {
        event.preventDefault();
        openTab();
        return;
      }

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
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [
    appPreferences.hasSeenFocusModeInfo,
    focusTab,
    isCommandPaletteOpen,
    movePaneToTab,
    openTab,
    performSplit,
    tabs,
  ]);

  return {
    isCommandPaletteOpen,
    openCommandPalette,
    closeCommandPalette,
    showFocusModeInfo,
    setShowFocusModeInfo,
  };
};
