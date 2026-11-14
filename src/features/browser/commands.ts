/**
 * Browser commands: opening web pages and toggling a browser pane's toolbar
 */

import {
  activePaneType,
  hasActivePane,
  paneActionsEnabled,
} from "@/commands/contextKeys/appContextKeys";
import type { CommandDescriptor } from "@/commands/core/types";
import { MenuId } from "@/commands/menus/types";
import {
  openBrowserPane,
  updatePaneProperty,
} from "@features/workbench/client/actions/pane";
import { ApplicationCommands } from "@shared/commands";

export default [
  // Pane: Open Web Page
  {
    id: ApplicationCommands.PANE_OPEN_WEB_PAGE,
    title: "Open Web Page",
    description: "Open a web page in a split view",
    category: "Pane",
    keybinding: { key: "Cmd+L" },
    when: hasActivePane.isTrue(),
    run: (context) => {
      context.setIsUrlDialogOpen?.(true);
    },
  },

  // Pane: Split Left with Browser
  {
    id: ApplicationCommands.PANE_SPLIT_LEFT_BROWSER,
    title: "Split Browser Left",
    description: "Create a new browser pane to the left of the current pane",
    category: "Pane",
    keybinding: { key: "Cmd+Shift+B+Left" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/3_split_browser",
      order: 1,
      title: "Left",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        openBrowserPane(targetTabId, targetPaneId, "about:blank", "row", true);
      }
    },
  },

  // Pane: Split Right with Browser
  {
    id: ApplicationCommands.PANE_SPLIT_RIGHT_BROWSER,
    title: "Split Browser Right",
    description: "Create a new browser pane to the right of the current pane",
    category: "Pane",
    keybinding: { key: "Cmd+Shift+B+Right" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/3_split_browser",
      order: 2,
      title: "Right",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        openBrowserPane(targetTabId, targetPaneId, "about:blank", "row", false);
      }
    },
  },

  // Pane: Split Top with Browser
  {
    id: ApplicationCommands.PANE_SPLIT_TOP_BROWSER,
    title: "Split Browser Top",
    description: "Create a new browser pane above the current pane",
    category: "Pane",
    keybinding: { key: "Cmd+Shift+B+Up" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/3_split_browser",
      order: 3,
      title: "Top",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        openBrowserPane(
          targetTabId,
          targetPaneId,
          "about:blank",
          "column",
          true,
        );
      }
    },
  },

  // Pane: Split Bottom with Browser
  {
    id: ApplicationCommands.PANE_SPLIT_BOTTOM_BROWSER,
    title: "Split Browser Bottom",
    description: "Create a new browser pane below the current pane",
    category: "Pane",
    keybinding: { key: "Cmd+Shift+B+Down" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/3_split_browser",
      order: 4,
      title: "Bottom",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        openBrowserPane(
          targetTabId,
          targetPaneId,
          "about:blank",
          "column",
          false,
        );
      }
    },
  },

  // Browser: Toggle Browser Toolbar
  {
    id: ApplicationCommands.BROWSER_TOGGLE_TOOLBAR,
    title: "Toggle Browser Toolbar",
    description: "Show or hide the toolbar in the active browser pane",
    category: "Browser",
    when: activePaneType.equals("browser"),
    run: ({ activeTab, activePaneId }) => {
      if (!activePaneId) return;
      const pane = activeTab.panes[activePaneId];
      updatePaneProperty(activeTab.id, activePaneId, {
        chromeless: !pane.chromeless,
      });
    },
  },
] satisfies CommandDescriptor[];
