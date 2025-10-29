import { applicationModeAtom, activeTabIdAtom, tabsAtom } from "@/store/atoms";
import type { Tab } from "@/types";
import { walkLayout } from "@/utils/layout";
import { getDefaultStore } from "jotai";

const store = getDefaultStore();

/**
 * Check if focus mode is currently active
 */
export function isFocusModeActive(): boolean {
  return store.get(applicationModeAtom) === "focus";
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
  const tabs = store.get(tabsAtom);
  const tab = tabs.find((t) => t.id === tabId);
  
  if (!tab || !tab.panes[paneId]) {
    return;
  }

  // Set the active pane if needed
  if (tab.activePaneId !== paneId) {
    store.set(tabsAtom, (tabs) =>
      tabs.map((t) => {
        if (t.id !== tabId) {
          return t;
        }
        return {
          ...t,
          activePaneId: paneId,
        };
      })
    );
  }

  // Enter focus mode
  store.set(applicationModeAtom, "focus");
}

/**
 * Exit focus mode
 */
export function exitFocusMode(): void {
  store.set(applicationModeAtom, "normal");
}

/**
 * Toggle focus mode for a tab
 */
export function toggleFocusMode(tabId: string, paneId: string): void {
  if (isFocusModeActive()) {
    exitFocusMode();
  } else {
    enterFocusMode(tabId, paneId);
  }
}

/**
 * Focus a specific pane by setting it as active and entering focus mode
 */
export function focusPane(tabId: string, paneId: string): void {
  enterFocusMode(tabId, paneId);
}

/**
 * Navigate to the next or previous pane in focus mode
 */
export function navigateFocusedPane(
  direction: "next" | "prev"
): void {
  const applicationMode = store.get(applicationModeAtom);
  if (applicationMode !== "focus") {
    return;
  }

  const activeTabId = store.get(activeTabIdAtom);
  if (!activeTabId) {
    return;
  }

  const tabs = store.get(tabsAtom);
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) {
    return;
  }

  const paneIds = getAllPaneIds(tab);
  if (paneIds.length <= 1) {
    return;
  }

  const currentIndex = paneIds.indexOf(tab.activePaneId);
  if (currentIndex === -1) {
    return;
  }

  let nextIndex: number;
  if (direction === "next") {
    nextIndex = (currentIndex + 1) % paneIds.length;
  } else {
    nextIndex = (currentIndex - 1 + paneIds.length) % paneIds.length;
  }

  const nextPaneId = paneIds[nextIndex];

  store.set(tabsAtom, (tabs) =>
    tabs.map((t) => {
      if (t.id !== activeTabId) {
        return t;
      }
      return {
        ...t,
        activePaneId: nextPaneId,
      };
    })
  );
}
