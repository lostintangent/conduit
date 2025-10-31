/**
 * View command handlers
 *
 * Handlers for view-related commands including design mode and keyboard shortcuts.
 */

import { tabsAtom, type ApplicationMode } from "@/store/atoms";
import type { LayoutNode, LayoutPaneNode, LayoutSplitNode } from "@/types";
import { walkLayout } from "@/utils/layout";
import { getDefaultStore } from "jotai";

const store = getDefaultStore();

const layoutHasCustomSizes = (node: LayoutNode): boolean => {
  let hasCustomSize = false;
  walkLayout(node, ({ node: current }) => {
    if (current.size !== undefined) {
      hasCustomSize = true;
      return false;
    }
    return true;
  });
  return hasCustomSize;
};

const stripLayoutSizes = (node: LayoutNode): LayoutNode => {
  if (node.type === "split") {
    const cleanedChildren = node.children.map(stripLayoutSizes);
    const hasChanged =
      node.size !== undefined ||
      cleanedChildren.some((child, index) => child !== node.children[index]);

    if (!hasChanged) {
      return node;
    }

    return {
      id: node.id,
      type: "split",
      direction: node.direction,
      children: cleanedChildren,
    } as LayoutSplitNode;
  }

  if (node.size === undefined) {
    return node;
  }

  return {
    id: node.id,
    type: "pane",
    paneId: node.paneId,
  } as LayoutPaneNode;
};

/**
 * Toggle design mode on/off
 *
 * @param applicationMode - Current application mode
 * @param setApplicationMode - Function to update application mode
 */
export function handleToggleDesignMode(
  applicationMode: ApplicationMode | undefined,
  setApplicationMode: ((mode: ApplicationMode) => void) | undefined
): void {
  if (!setApplicationMode) return;

  const newMode = applicationMode === 'design' ? 'normal' : 'design';
  setApplicationMode(newMode);
}

/**
 * Open the keyboard shortcuts editor
 *
 * @param setShowKeybindingsEditor - Function to show the keybindings editor
 */
export function handleOpenKeyboardShortcuts(
  setShowKeybindingsEditor: (show: boolean) => void
): void {
  setShowKeybindingsEditor(true);
}

/**
 * Show the command palette
 *
 * @param setIsCommandPaletteOpenOverride - Function to override command palette open state
 */
export function handleShowCommandPalette(
  setIsCommandPaletteOpenOverride: (open: boolean) => void
): void {
  setIsCommandPaletteOpenOverride(true);
}

/**
 * Reset layout sizes for a tab
 *
 * @param tabId - ID of the tab to reset
 */
export function handleResetLayout(tabId: string): void {
  const tabs = store.get(tabsAtom);
  store.set(
    tabsAtom,
    tabs.map((tab) => {
      if (tab.id !== tabId) {
        return tab;
      }

      const cleanedLayout = stripLayoutSizes(tab.layout);
      if (cleanedLayout === tab.layout) {
        return tab;
      }

      return {
        ...tab,
        layout: cleanedLayout,
      };
    })
  );
}
