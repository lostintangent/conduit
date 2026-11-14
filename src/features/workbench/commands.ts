/**
 * Workbench commands: the view, tabs, and splitting, moving and navigating panes
 */

import { When } from "@/commands";
import {
  activePaneType,
  hasActivePane,
  hasCustomLayout,
  hasGitRepo,
  paneActionsEnabled,
  paneCanBeCollapsed,
  paneIsCollapsed,
  tabCount,
  tabIsLocked,
} from "@/commands/contextKeys/appContextKeys";
import type { CommandDescriptor } from "@/commands/core/types";
import { MenuId } from "@/commands/menus/types";
import { toggleFocusMode } from "@features/workbench/client/actions/focusMode";
import { enqueueNotification } from "@features/workbench/client/actions/notifications";
import {
  cloneTerminalPane,
  closePane,
  movePane,
  setPaneCollapsed,
  splitPane,
} from "@features/workbench/client/actions/pane";
import { navigatePane } from "@features/workbench/client/actions/paneNavigation";
import {
  closeTab,
  duplicateTab,
  duplicateTabIntoWorktree,
  lockTab,
  movePaneToTab,
  openTab,
  unlockTab,
  updateTabProperty,
} from "@features/workbench/client/actions/tab";
import {
  handleResetLayout,
  handleToggleDesignMode,
  handleToggleSidebar,
  handleViewFileExplorer,
} from "@features/workbench/client/viewHandlers";
import { ApplicationCommands } from "@shared/commands";

export default [
  // View: Toggle Focus Mode
  {
    id: ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE,
    title: "Toggle Focus Mode",
    description: "Zoom into a single pane or return to normal view",
    category: "View",
    keybinding: { key: "Cmd+Shift+F" },
    run: (context) => {
      if (context.activeTab) {
        toggleFocusMode(context.activeTab.id, context.activeTab.activePaneId);
      }
    },
  },

  // View: Toggle Design Mode
  {
    id: ApplicationCommands.VIEW_TOGGLE_DESIGN_MODE,
    title: "Toggle Design Mode",
    description: "Show or hide pane control buttons for layout manipulation",
    category: "View",
    keybinding: { key: "Cmd+D" },
    run: (context) => {
      handleToggleDesignMode(
        context.applicationMode,
        context.setApplicationMode,
      );
    },
  },

  // View: Show Command Palette
  {
    id: ApplicationCommands.VIEW_SHOW_COMMAND_PALETTE,
    title: "Show Command Palette",
    description: "Show all available commands",
    category: "View",
    keybinding: { key: "Cmd+Shift+P" },
    run: (context) => {
      // Open QuickOpen in command mode (with ">" prefix)
      context.setQuickOpenInitialValue?.(">");
      context.setIsQuickOpenOpen?.(true);
    },
  },

  // View: Toggle Sidebar
  {
    id: ApplicationCommands.VIEW_TOGGLE_SIDEBAR,
    title: "Toggle Sidebar",
    description: "Show or hide the sidebar overlay",
    category: "View",
    keybinding: { key: "Cmd+E" },
    run: () => {
      handleToggleSidebar();
    },
  },

  // View: Reset Layout
  {
    id: ApplicationCommands.VIEW_RESET_LAYOUT,
    title: "Reset Layout",
    description: "Restore the default pane sizes for this tab",
    category: "View",
    when: hasCustomLayout.isTrue(),
    run: (context) => {
      if (context.activeTab) {
        handleResetLayout(context.activeTab.id);
      }
    },
  },

  // Tab: New
  {
    id: ApplicationCommands.TAB_NEW,
    title: "New Tab",
    description: "Create a new terminal tab",
    category: "Tab",
    keybinding: { key: "Cmd+T" },
    run: () => {
      void openTab();
    },
  },

  // Tab: Close
  {
    id: ApplicationCommands.TAB_CLOSE,
    title: "Close Tab",
    description: "Close the currently active tab",
    category: "Tab",
    keybinding: { key: "Cmd+W" },
    when: When.and(tabCount.greaterThan(1), tabIsLocked.isFalse()),
    menu: {
      id: MenuId.TabContext,
      group: "4_tab",
      order: 1,
    },
    run: (context, tabId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      if (targetTabId) {
        closeTab(targetTabId);
      }
    },
  },

  // Tab: Duplicate
  {
    id: ApplicationCommands.TAB_DUPLICATE,
    title: "Duplicate Tab",
    description: "Duplicate the current tab with all its panes and layout",
    category: "Tab",
    keybinding: { key: "Cmd+Shift+D" },
    menu: {
      id: MenuId.TabContext,
      group: "2_tab",
      order: 2,
    },
    run: async (context, tabId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      if (targetTabId) {
        // Awaited so `conduit duplicate` returns once the copy exists.
        await duplicateTab(targetTabId);
      }
    },
  },

  // Tab: Duplicate with Custom CWD
  {
    id: ApplicationCommands.TAB_DUPLICATE_WITH_CWD,
    title: "Duplicate Tab with CWD",
    description:
      "Duplicate the current tab and set a custom working directory for all panes",
    category: "Tab",
    keybinding: { key: "Cmd+Alt+D" },
    menu: {
      id: MenuId.TabContext,
      group: "2_tab/duplicate_into",
      order: 1,
      title: "CWD",
    },
    run: (context, tabId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      if (targetTabId && context.setShowDuplicateTabWithCwdDialog) {
        context.setShowDuplicateTabWithCwdDialog(targetTabId);
      }
    },
  },

  // Tab: Duplicate into Worktree
  {
    id: ApplicationCommands.TAB_DUPLICATE_INTO_WORKTREE,
    title: "Duplicate Tab into Worktree",
    description:
      "Create an isolated git worktree and duplicate the current tab into it",
    category: "Tab",
    keybinding: { key: "Cmd+Alt+W" },
    // Only menus know hasGitRepo, so the run checks for a repository itself
    menu: {
      id: MenuId.TabContext,
      group: "2_tab/duplicate_into",
      order: 2,
      when: hasGitRepo.isTrue(),
      title: "Worktree",
    },
    run: async (context, tabId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      if (!targetTabId) {
        return;
      }

      let errorMessage: string | null = null;

      try {
        const result = await duplicateTabIntoWorktree(targetTabId);
        if (!result) {
          errorMessage = "Failed to duplicate tab into worktree";
        }
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      if (errorMessage) {
        enqueueNotification({
          kind: "error",
          message: errorMessage,
          autoCloseMs: 5000,
        });
      }
    },
  },

  // Tab: Rename
  {
    id: ApplicationCommands.TAB_RENAME,
    title: "Rename Tab",
    description: "Rename the current tab",
    category: "Tab",
    when: tabIsLocked.isFalse(),
    menu: [
      {
        id: MenuId.TabContext,
        group: "1_tab",
        order: 1,
      },
    ],
    run: (context, tabId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      if (targetTabId && context.setTitleModal) {
        const tab = context.allTabs.find((t) => t.id === targetTabId);
        context.setTitleModal(targetTabId, tab?.name ?? "");
      }
    },
  },

  // Tab: Lock
  {
    id: ApplicationCommands.TAB_LOCK,
    title: "Lock Tab",
    description: "Prevent layout changes and closing for the current tab",
    category: "Tab",
    when: tabIsLocked.isFalse(),
    menu: {
      id: MenuId.TabContext,
      group: "3_tab",
      order: 3,
      when: tabIsLocked.isFalse(),
    },
    run: (context, tabId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      if (targetTabId) {
        lockTab(targetTabId);
      }
    },
  },

  // Tab: Unlock
  {
    id: ApplicationCommands.TAB_UNLOCK,
    title: "Unlock Tab",
    description: "Allow layout changes and closing for the current tab",
    category: "Tab",
    when: tabIsLocked.isTrue(),
    menu: {
      id: MenuId.TabContext,
      group: "3_tab",
      order: 4,
      when: tabIsLocked.isTrue(),
    },
    run: (context, tabId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      if (targetTabId) {
        unlockTab(targetTabId);
      }
    },
  },

  // Tab: Synchronize panes
  {
    id: ApplicationCommands.TAB_TOGGLE_SYNCHRONIZE,
    title: "Synchronize Panes",
    description:
      "Mirror keystrokes from the active terminal to the rest of the tab",
    category: "Tab",
    menu: {
      id: MenuId.TabContext,
      group: "3_tab",
      order: 1,
    },
    run: (context, tabId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetTab =
        context.allTabs.find((tab) => tab.id === targetTabId) ??
        context.activeTab;

      updateTabProperty(targetTabId, {
        synchronized: !targetTab.synchronized,
      });
    },
  },

  // Pane: Toggle Focus
  {
    id: ApplicationCommands.PANE_FOCUS,
    title: "Toggle Focus Mode",
    description: "Toggle focus mode for the current pane",
    category: "Pane",
    when: hasActivePane.isTrue(),
    menu: {
      id: MenuId.PaneContext,
      group: "1_pane",
      order: 1,
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        toggleFocusMode(targetTabId, targetPaneId);
      }
    },
  },

  // Pane: View File Explorer
  {
    id: ApplicationCommands.PANE_VIEW_FILES,
    title: "View File Explorer",
    description: "View files in the terminal's current directory",
    category: "Pane",
    keybinding: { key: "Cmd+E" },
    when: When.and(hasActivePane.isTrue(), activePaneType.equals("terminal")),
    menu: {
      id: MenuId.PaneContext,
      group: "1_pane",
      order: 2,
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        // Get the CWD from the active terminal pane
        const pane = context.activeTab?.panes?.[targetPaneId];
        const cwd = pane?.type === "terminal" ? pane.cwd : undefined;
        handleViewFileExplorer(cwd);
      }
    },
  },

  {
    id: ApplicationCommands.PANE_COLLAPSE,
    title: "Collapse Pane",
    description: "Collapse the active pane",
    category: "Pane",
    when: When.and(paneCanBeCollapsed.isTrue(), paneIsCollapsed.isFalse()),
    menu: {
      id: MenuId.PaneContext,
      group: "2_pane",
      order: 4,
      when: When.and(paneIsCollapsed.isFalse()),
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (!targetPaneId) return;
      setPaneCollapsed(targetTabId, targetPaneId, true);
    },
  },

  {
    id: ApplicationCommands.PANE_EXPAND,
    title: "Expand Pane",
    description: "Expand the active pane back to its original size",
    category: "Pane",
    when: When.and(paneIsCollapsed.isTrue()),
    menu: {
      id: MenuId.PaneContext,
      group: "2_pane",
      order: 4,
      when: paneIsCollapsed.isTrue(),
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (!targetPaneId) return;
      setPaneCollapsed(targetTabId, targetPaneId, false);
    },
  },

  // Pane: Close
  {
    id: ApplicationCommands.PANE_CLOSE,
    title: "Close Pane",
    description: "Close the current pane",
    category: "Pane",
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "9_close",
      order: 1,
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (!targetPaneId) return;
      closePane(targetTabId, targetPaneId);
    },
  },

  // Pane: Split Left
  {
    id: ApplicationCommands.PANE_SPLIT_LEFT,
    title: "Split Pane Left",
    description: "Create a new pane to the left of the current pane",
    category: "Pane",
    keybinding: { key: "Cmd+Shift+Left" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "2_split",
      order: 1,
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        void splitPane(targetTabId, targetPaneId, "row", true);
      }
    },
  },

  // Pane: Split Right
  {
    id: ApplicationCommands.PANE_SPLIT_RIGHT,
    title: "Split Pane Right",
    description: "Create a new pane to the right of the current pane",
    category: "Pane",
    keybinding: { key: "Cmd+Shift+Right" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "2_split",
      order: 2,
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        void splitPane(targetTabId, targetPaneId, "row");
      }
    },
  },

  // Pane: Split Top
  {
    id: ApplicationCommands.PANE_SPLIT_TOP,
    title: "Split Pane Top",
    description: "Create a new pane above the current pane",
    category: "Pane",
    keybinding: { key: "Cmd+Shift+Up" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "2_split",
      order: 3,
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        void splitPane(targetTabId, targetPaneId, "column", true);
      }
    },
  },

  // Pane: Split Bottom
  {
    id: ApplicationCommands.PANE_SPLIT_BOTTOM,
    title: "Split Pane Bottom",
    description: "Create a new pane below the current pane",
    category: "Pane",
    keybinding: { key: "Cmd+Shift+Down" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "2_split",
      order: 4,
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        void splitPane(targetTabId, targetPaneId, "column");
      }
    },
  },

  // Pane navigation uses Cmd+Option+Arrow (as in iTerm2, Ghostty and Warp),
  // which works from every pane. Cmd+Arrow also works outside editors, which
  // keep it for moving the cursor.

  // Pane: Navigate Left
  {
    id: ApplicationCommands.PANE_NAVIGATE_LEFT,
    title: "Navigate to Pane on Left",
    description: "Focus the pane to the left of the current pane",
    category: "Pane",
    keybinding: [{ key: "Cmd+Alt+Left" }, { key: "Cmd+Left" }],
    when: hasActivePane.isTrue(),
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        navigatePane(targetTabId, targetPaneId, "left");
      }
    },
  },

  // Pane: Navigate Right
  {
    id: ApplicationCommands.PANE_NAVIGATE_RIGHT,
    title: "Navigate to Pane on Right",
    description: "Focus the pane to the right of the current pane",
    category: "Pane",
    keybinding: [{ key: "Cmd+Alt+Right" }, { key: "Cmd+Right" }],
    when: hasActivePane.isTrue(),
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        navigatePane(targetTabId, targetPaneId, "right");
      }
    },
  },

  // Pane: Navigate Up
  {
    id: ApplicationCommands.PANE_NAVIGATE_UP,
    title: "Navigate to Pane Above",
    description: "Focus the pane above the current pane",
    category: "Pane",
    keybinding: [{ key: "Cmd+Alt+Up" }, { key: "Cmd+Up" }],
    when: hasActivePane.isTrue(),
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        navigatePane(targetTabId, targetPaneId, "up");
      }
    },
  },

  // Pane: Navigate Down
  {
    id: ApplicationCommands.PANE_NAVIGATE_DOWN,
    title: "Navigate to Pane Below",
    description: "Focus the pane below the current pane",
    category: "Pane",
    keybinding: [{ key: "Cmd+Alt+Down" }, { key: "Cmd+Down" }],
    when: hasActivePane.isTrue(),
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        navigatePane(targetTabId, targetPaneId, "down");
      }
    },
  },

  // Pane: Move Left
  {
    id: ApplicationCommands.PANE_MOVE_LEFT,
    title: "Move Pane Left",
    description: "Move the current pane to the left",
    category: "Pane",
    keybinding: { key: "Ctrl+Cmd+Left" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "4_move",
      order: 1,
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        movePane(targetTabId, targetPaneId, "left");
      }
    },
  },

  // Pane: Move Right
  {
    id: ApplicationCommands.PANE_MOVE_RIGHT,
    title: "Move Pane Right",
    description: "Move the current pane to the right",
    category: "Pane",
    keybinding: { key: "Ctrl+Cmd+Right" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "4_move",
      order: 2,
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        movePane(targetTabId, targetPaneId, "right");
      }
    },
  },

  // Pane: Move Up
  {
    id: ApplicationCommands.PANE_MOVE_UP,
    title: "Move Pane Up",
    description: "Move the current pane upward",
    category: "Pane",
    keybinding: { key: "Ctrl+Cmd+Up" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "4_move",
      order: 3,
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        movePane(targetTabId, targetPaneId, "up");
      }
    },
  },

  // Pane: Move Down
  {
    id: ApplicationCommands.PANE_MOVE_DOWN,
    title: "Move Pane Down",
    description: "Move the current pane downward",
    category: "Pane",
    keybinding: { key: "Ctrl+Cmd+Down" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "4_move",
      order: 4,
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        movePane(targetTabId, targetPaneId, "down");
      }
    },
  },

  // Pane: Move to New Tab
  {
    id: ApplicationCommands.PANE_MOVE_TO_TAB,
    title: "Move Pane to New Tab",
    description: "Move the current pane to a new tab",
    category: "Pane",
    keybinding: { key: "Cmd+Alt+T" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "2_pane",
      order: 3,
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        movePaneToTab(targetTabId, targetPaneId);
      }
    },
  },

  // Pane: Clone
  {
    id: ApplicationCommands.PANE_CLONE,
    title: "Clone Terminal",
    description: "Create a clone of the active terminal",
    category: "Pane",
    when: When.and(paneActionsEnabled, activePaneType.equals("terminal")),
    menu: {
      id: MenuId.PaneContext,
      group: "2_split",
      when: activePaneType.equals("terminal"),
      order: 5,
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (!targetPaneId) return;
      cloneTerminalPane(targetTabId, targetPaneId);
    },
  },
] satisfies CommandDescriptor[];
