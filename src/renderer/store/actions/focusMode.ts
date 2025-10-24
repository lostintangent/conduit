import { tabsAtom } from "@/store/atoms";
import type { Tab } from "@/types";
import { walkLayout } from "@/utils/layout";
import { getDefaultStore } from "jotai";

const store = getDefaultStore();

/**
 * Check if focus mode is currently active for a tab
 */
export function isFocusModeActive(tab: Tab): boolean {
  return tab.mode === "focus";
}

/**
 * Check if a tab has multiple panes
 */
export function hasMultiplePanes(tab: Tab): boolean {
  return Object.keys(tab.panes).length > 1;
}

/**
 * Get all pane IDs in order by walking the layout tree
 */
export function getAllPaneIds(tab: Tab): string[] {
  const paneIds: string[] = [];

  walkLayout(tab.layout, ({ node }) => {
    if (node.type === "pane") {
      paneIds.push(node.paneId);
    }
    return true;
  });

  return paneIds;
}

/**
 * Enter focus mode for a specific pane
 */
export function enterFocusMode(tabId: string, paneId: string): void {
  store.set(tabsAtom, (tabs) =>
    tabs.map((tab) => {
      if (tab.id !== tabId) {
        return tab;
      }

      // Verify the pane exists
      if (!tab.panes[paneId]) {
        return tab;
      }

      return {
        ...tab,
        mode: "focus",
        activePaneId: paneId,
      };
    })
  );
}

/**
 * Exit focus mode for a tab
 */
export function exitFocusMode(tabId: string): void {
  store.set(tabsAtom, (tabs) =>
    tabs.map((tab) => {
      if (tab.id !== tabId) {
        return tab;
      }

      return {
        ...tab,
        mode: "layout",
      };
    })
  );
}

/**
 * Toggle focus mode for a tab
 */
export function toggleFocusMode(tabId: string, paneId: string): void {
  const tabs = store.get(tabsAtom);
  const tab = tabs.find((t) => t.id === tabId);

  if (!tab) {
    return;
  }

  if (isFocusModeActive(tab)) {
    exitFocusMode(tabId);
  } else {
    enterFocusMode(tabId, paneId);
  }
}

/**
 * Navigate to the next or previous pane in focus mode
 */
export function navigateFocusedPane(
  tabId: string,
  direction: "next" | "prev"
): void {
  store.set(tabsAtom, (tabs) =>
    tabs.map((tab) => {
      if (tab.id !== tabId) {
        return tab;
      }

      if (tab.mode !== "focus") {
        return tab;
      }

      const paneIds = getAllPaneIds(tab);
      if (paneIds.length <= 1) {
        return tab;
      }

      const currentIndex = paneIds.indexOf(tab.activePaneId);
      if (currentIndex === -1) {
        return tab;
      }

      let nextIndex: number;
      if (direction === "next") {
        nextIndex = (currentIndex + 1) % paneIds.length;
      } else {
        nextIndex = (currentIndex - 1 + paneIds.length) % paneIds.length;
      }

      const nextPaneId = paneIds[nextIndex];

      return {
        ...tab,
        activePaneId: nextPaneId,
      };
    })
  );
}
