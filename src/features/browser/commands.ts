/**
 * Browser commands: opening web pages, moving through a page's history and
 * toggling a browser pane's toolbar
 */

import {
  activePaneType,
  hasActivePane,
  paneActionsEnabled,
} from "@/commands/contextKeys/appContextKeys";
import type { CommandContext, CommandDescriptor } from "@/commands/core/types";
import { MenuId } from "@/commands/menus/types";
import {
  openBrowserPane,
  updatePaneProperty,
} from "@features/workbench/client/actions/pane";
import { getBrowserPaneHandlers } from "@features/browser/client/paneHandlers";
import { getWebview } from "@features/browser/client/webview";
import { ApplicationCommands } from "@shared/commands";

const activePage = ({ activePaneId }: CommandContext) =>
  activePaneId ? getWebview(activePaneId) : null;

const activePaneHandlers = ({ activePaneId }: CommandContext) =>
  activePaneId ? getBrowserPaneHandlers(activePaneId) : undefined;

export default [
  // Pane: Open Web Page
  {
    id: ApplicationCommands.PANE_OPEN_WEB_PAGE,
    title: "Open Web Page",
    description:
      "Go to the browser pane's address bar, or open a web page in a split view",
    category: "Pane",
    keybinding: { key: "Cmd+L" },
    when: hasActivePane.isTrue(),
    run: (context) => {
      const browserPane = activePaneHandlers(context);
      if (browserPane) browserPane.focusAddressBar();
      else context.setIsUrlDialogOpen?.(true);
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

  {
    id: ApplicationCommands.BROWSER_RELOAD,
    title: "Reload Page",
    description: "Reload the page in the active browser pane",
    category: "Browser",
    keybinding: { key: "Cmd+R" },
    when: activePaneType.equals("browser"),
    run: (context) => activePage(context)?.reload(),
  },

  {
    id: ApplicationCommands.BROWSER_GO_BACK,
    title: "Go Back",
    description: "Go back to the previous page in the active browser pane",
    category: "Browser",
    keybinding: { key: "Cmd+[" },
    when: activePaneType.equals("browser"),
    run: (context) => activePage(context)?.goBack(),
  },

  {
    id: ApplicationCommands.BROWSER_GO_FORWARD,
    title: "Go Forward",
    description: "Go forward to the next page in the active browser pane",
    category: "Browser",
    keybinding: { key: "Cmd+]" },
    when: activePaneType.equals("browser"),
    run: (context) => activePage(context)?.goForward(),
  },

  // A page with its own find, like a document editor, keeps these keys, see
  // getAppKeys
  {
    id: ApplicationCommands.BROWSER_FIND,
    title: "Find in Page",
    description: "Find text in the page in the active browser pane",
    category: "Browser",
    keybinding: { key: "Cmd+F" },
    when: activePaneType.equals("browser"),
    run: (context) => activePaneHandlers(context)?.find(),
  },

  {
    id: ApplicationCommands.BROWSER_FIND_NEXT,
    title: "Find Next",
    description: "Go to the next match in the page in the active browser pane",
    category: "Browser",
    keybinding: { key: "Cmd+G" },
    when: activePaneType.equals("browser"),
    run: (context) => activePaneHandlers(context)?.findNext(),
  },

  {
    id: ApplicationCommands.BROWSER_FIND_PREVIOUS,
    title: "Find Previous",
    description:
      "Go to the previous match in the page in the active browser pane",
    category: "Browser",
    keybinding: { key: "Cmd+Shift+G" },
    when: activePaneType.equals("browser"),
    run: (context) => activePaneHandlers(context)?.findPrevious(),
  },
] satisfies CommandDescriptor[];
