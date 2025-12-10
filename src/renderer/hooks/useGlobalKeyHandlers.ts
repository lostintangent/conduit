import {
  navigatePane,
  type PaneNavigationDirection,
} from "@/store/actions/paneNavigation";
import { focusTab } from "@/store/actions/tab";
import { activeTabAtom, applicationModeAtom, tabsAtom } from "@/store/atoms";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useEffectEvent, useState } from "react";

// This hook handles a small set of global keyboard shortcuts
// that aren't otherwise handled by the command system. In particular:
// 1. Escape to exit modes like focus/design/overview
// 2. Cmd+Arrow to navigate panes
// 3. Cmd+1, Cmd+2, ... Cmd+9 to focus tabs by index

type UseGlobalKeyHandlersResult = {
  isCommandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
};

export function useGlobalKeyHandlers(): UseGlobalKeyHandlersResult {
  const [applicationMode, setApplicationMode] = useAtom(applicationModeAtom);
  const tabs = useAtomValue(tabsAtom);
  const activeTab = useAtomValue(activeTabAtom);

  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    // Escape: Exit focus/design/overview modes
    if (
      event.key === "Escape" &&
      ["focus", "overview", "design"].includes(applicationMode)
    ) {
      setApplicationMode("normal");
      return;
    }

    // The remaining shortcuts all require the primary modifier (Cmd on Mac, Ctrl on Windows/Linux),
    // and should not trigger when the command palette is open
    // or when the Shift key is held.
    const isMac = navigator.platform.toLowerCase().includes("mac");
    const primaryModifier = isMac ? event.metaKey : event.ctrlKey;
    if (isCommandPaletteOpen || !primaryModifier || event.shiftKey) {
      return;
    }

    const key = event.key.toLowerCase();
    const directionKeyMap: Record<string, PaneNavigationDirection> = {
      arrowleft: "left",
      arrowright: "right",
      arrowup: "up",
      arrowdown: "down",
    };

    // Cmd+Arrow: Navigate pane (without modifiers)
    const direction = directionKeyMap[key];
    if (direction && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      navigatePane(activeTab.id, activeTab.activePaneId, direction);
      return;
    }

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
  });

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return {
    isCommandPaletteOpen,
    openCommandPalette: () => setCommandPaletteOpen(true),
    closeCommandPalette: () => setCommandPaletteOpen(false),
  };
}
