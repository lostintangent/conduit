/**
 * Application-level command registrations
 *
 * This module contains all application-level commands that interact with
 * the app's UI state (focus mode, pane controls, etc.).
 */

import type { ICommandRegistry } from "@/commands";
import { When } from "@/commands";
import {
  activePaneType,
  hasActivePane,
  hasCustomLayout,
  hasCwd,
  hasGitRepo,
  hasLastWorkspace,
  hasWorkspace,
  isInAgentSession,
  paneCanBeCollapsed,
  paneIsCollapsed,
  tabCount,
  tabHasWorktrees,
  tabIsLocked,
} from "@/commands/contextKeys/appContextKeys";
import {
  handleCloseWorkspace,
  handleCreateVM,
  handleDuplicateWorkspace,
  handleManageSessions,
  handleMergeAndClose,
  handleOpenInVSCode,
  handleOpenKeyboardShortcuts,
  handleOpenLastWorkspace,
  handleOpenWebPage,
  handleOpenWorkspace,
  handleRenameWorkspace,
  handleResetLayout,
  handleSaveWorkspace,
  handleShowCommandPalette,
  handleTerminate,
  handleToggleDesignMode,
  invokeEditorCommand,
} from "@/commands/handlers";
import {
  registerMenuContextBuilder,
  type MenuContextBuilder,
} from "@/commands/menus/menuContextBuilders";
import { registerSubmenu } from "@/commands/menus/submenuConfig";
import { MenuId } from "@/commands/menus/types";
import { toggleFocusMode } from "@/store/actions/focusMode";
import { enqueueNotification } from "@/store/actions/notifications";
import {
  cloneTerminalPane,
  closeAgentSessionPanes,
  closePane,
  movePane,
  openBrowserPane,
  openEditorPane,
  setPaneCollapsed,
  splitPane,
  splitPaneWithAgentSession,
} from "@/store/actions/pane";
import {
  closeTab,
  duplicateTab,
  duplicateTabIntoWorktree,
  lockTab,
  movePaneToTab,
  openTab,
  unlockTab,
  updateTabProperty,
} from "@/store/actions/tab";
import { walkLayout } from "@/utils/layout";
import { ApplicationCommands } from "@shared/commands";
import { registerFileTreeCommands } from "./fileTreeCommands";

// Re-export for convenience
export { ApplicationCommands };

/**
 * Register all application-level commands
 *
 * This should be called during app initialization, after the command
 * system has been initialized.
 */
export function registerApplicationCommands(
  commandRegistry: ICommandRegistry,
): void {
  // View: Toggle Focus Mode
  commandRegistry.registerCommand({
    id: ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE,
    title: "Toggle Focus Mode",
    description: "Zoom into a single pane or return to normal view",
    category: "View",
    keybinding: {
      key: "Cmd+Shift+F",
    },
    run: (context) => {
      if (context.activeTab) {
        toggleFocusMode(context.activeTab.id, context.activeTab.activePaneId);
      }
    },
  });

  // View: Toggle Design Mode
  commandRegistry.registerCommand({
    id: ApplicationCommands.VIEW_TOGGLE_DESIGN_MODE,
    title: "Toggle Design Mode",
    description: "Show or hide pane control buttons for layout manipulation",
    category: "View",
    keybinding: {
      key: "Cmd+D",
    },
    run: (context) => {
      handleToggleDesignMode(
        context.applicationMode,
        context.setApplicationMode,
      );
    },
  });

  // View: Open Keyboard Shortcuts
  commandRegistry.registerCommand({
    id: ApplicationCommands.VIEW_OPEN_KEYBOARD_SHORTCUTS,
    title: "Keyboard Shortcuts",
    description: "View and customize keyboard shortcuts",
    category: "View",
    keybinding: {
      key: "Cmd+K Cmd+S",
    },
    run: (context) => {
      handleOpenKeyboardShortcuts(context.setShowKeybindingsEditor);
    },
  });

  // View: Manage Pane Actions
  commandRegistry.registerCommand({
    id: ApplicationCommands.VIEW_OPEN_PANE_ACTIONS,
    title: "Pane Actions",
    description: "Customize the action available in design mode",
    category: "View",
    run: (context) => {
      context.view.openPaneActions();
    },
  });

  // View: Manage Agents
  commandRegistry.registerCommand({
    id: ApplicationCommands.VIEW_OPEN_AGENTS,
    title: "Agent Teams",
    description: "Configure AI agents for terminal prompt mode (Cmd+P)",
    category: "View",
    run: (context) => {
      context.view.openAgents();
    },
  });

  // View: Show Command Palette
  commandRegistry.registerCommand({
    id: ApplicationCommands.VIEW_SHOW_COMMAND_PALETTE,
    title: "Show Command Palette",
    description: "Show all available commands",
    category: "View",
    keybinding: {
      key: "Cmd+Shift+P",
    },
    run: (context) => {
      handleShowCommandPalette(context.setIsCommandPaletteOpenOverride);
    },
  });

  // Workspace: Save
  commandRegistry.registerCommand({
    id: ApplicationCommands.WORKSPACE_SAVE,
    title: "Save Workspace",
    description: "Save current tab layout for later restoration",
    category: "Workspace",
    keybinding: {
      key: "Cmd+K Cmd+W",
    },
    run: (context) => {
      void handleSaveWorkspace(
        context.allTabs,
        context.activeTab?.id,
        context.setShowCreateWorkspaceDialog,
      );
    },
  });

  // Workspace: Rename
  commandRegistry.registerCommand({
    id: ApplicationCommands.WORKSPACE_RENAME,
    title: "Rename Workspace",
    description: "Change the name of the current workspace",
    category: "Workspace",
    keybinding: {
      key: "Cmd+K Cmd+R",
    },
    when: hasWorkspace.isTrue(),
    run: (context) => {
      if (context.workspaceName) {
        handleRenameWorkspace(context.setShowRenameWorkspaceDialog);
      }
    },
  });

  // Workspace: Duplicate
  commandRegistry.registerCommand({
    id: ApplicationCommands.WORKSPACE_DUPLICATE,
    title: "Duplicate Workspace",
    description: "Create a copy of the current workspace with a new name",
    category: "Workspace",
    when: hasWorkspace.isTrue(),
    run: (context) => {
      if (context.workspaceName) {
        handleDuplicateWorkspace(context.setShowDuplicateWorkspaceDialog);
      }
    },
  });

  // Workspace: Close
  commandRegistry.registerCommand({
    id: ApplicationCommands.WORKSPACE_CLOSE,
    title: "Close Workspace",
    description: "Close the current workspace",
    category: "Workspace",
    keybinding: {
      key: "Cmd+K Cmd+C",
    },
    when: hasWorkspace.isTrue(),
    run: (context) => {
      if (context.workspaceName) {
        void handleCloseWorkspace();
      }
    },
  });

  // Workspace: Open
  commandRegistry.registerCommand({
    id: ApplicationCommands.WORKSPACE_OPEN,
    title: "Open Workspace",
    description: "Restore tabs from a saved workspace",
    category: "Workspace",
    keybinding: {
      key: "Cmd+K Cmd+O",
    },
    run: (context) => {
      handleOpenWorkspace(context.setShowWorkspacePicker);
    },
  });

  // Workspace: Open Last
  commandRegistry.registerCommand({
    id: ApplicationCommands.WORKSPACE_OPEN_LAST,
    title: "Continue Last Session",
    description: "Restore your workspace from when you last closed the app",
    category: "Workspace",
    when: hasLastWorkspace.isTrue(),
    run: () => {
      void handleOpenLastWorkspace();
    },
  });

  // View: Reset Layout
  commandRegistry.registerCommand({
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
  });

  // Tab: New
  commandRegistry.registerCommand({
    id: ApplicationCommands.TAB_NEW,
    title: "New Tab",
    description: "Create a new terminal tab",
    category: "Tab",
    keybinding: {
      key: "Cmd+T",
    },
    run: () => {
      void openTab();
    },
  });

  // Tab: Close
  commandRegistry.registerCommand({
    id: ApplicationCommands.TAB_CLOSE,
    title: "Close Tab",
    description: "Close the currently active tab",
    category: "Tab",
    keybinding: {
      key: "Cmd+W",
    },
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
  });

  // Tab: Duplicate
  commandRegistry.registerCommand({
    id: ApplicationCommands.TAB_DUPLICATE,
    title: "Duplicate Tab",
    description: "Duplicate the current tab with all its panes and layout",
    category: "Tab",
    keybinding: {
      key: "Cmd+Shift+D",
    },
    menu: {
      id: MenuId.TabContext,
      group: "2_tab",
      order: 2,
    },
    run: (context, tabId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      if (targetTabId) {
        void duplicateTab(targetTabId);
      }
    },
  });

  // Tab: Duplicate with Custom CWD
  commandRegistry.registerCommand({
    id: ApplicationCommands.TAB_DUPLICATE_WITH_CWD,
    title: "Duplicate Tab with CWD",
    description:
      "Duplicate the current tab and set a custom working directory for all panes",
    category: "Tab",
    keybinding: {
      key: "Cmd+Alt+D",
    },
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
  });

  // Tab: Duplicate into Worktree
  commandRegistry.registerCommand({
    id: ApplicationCommands.TAB_DUPLICATE_INTO_WORKTREE,
    title: "Duplicate Tab into Worktree",
    description:
      "Create an isolated git worktree and duplicate the current tab into it",
    category: "Tab",
    keybinding: {
      key: "Cmd+Alt+W",
    },
    when: When.and(hasGitRepo.isTrue()),
    menu: {
      id: MenuId.TabContext,
      group: "2_tab/duplicate_into",
      order: 2,
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
  });

  // Tab: Rename
  commandRegistry.registerCommand({
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
  });

  // Tab: Lock
  commandRegistry.registerCommand({
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
  });

  // Tab: Unlock
  commandRegistry.registerCommand({
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
  });

  // Tab: Synchronize panes
  commandRegistry.registerCommand({
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
  });

  const paneActionsEnabled = When.and(
    hasActivePane.isTrue(),
    tabIsLocked.isFalse(),
    paneIsCollapsed.isFalse(),
  );

  // Pane: Toggle Focus
  commandRegistry.registerCommand({
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
  });

  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_COLLAPSE,
    title: "Collapse Pane",
    description: "Collapse the active pane",
    category: "Pane",
    when: When.and(paneCanBeCollapsed.isTrue(), paneIsCollapsed.isFalse()),
    menu: {
      id: MenuId.PaneContext,
      group: "1_pane",
      order: 3,
      when: When.and(paneIsCollapsed.isFalse()),
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab.id;
      const targetPaneId = paneId ?? context.activePaneId;
      setPaneCollapsed(targetTabId, targetPaneId, true);
    },
  });

  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_EXPAND,
    title: "Expand Pane",
    description: "Expand the active pane back to its original size",
    category: "Pane",
    when: When.and(paneIsCollapsed.isTrue()),
    menu: {
      id: MenuId.PaneContext,
      group: "1_pane",
      order: 3,
      when: paneIsCollapsed.isTrue(),
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab.id;
      const targetPaneId = paneId ?? context.activePaneId;
      setPaneCollapsed(targetTabId, targetPaneId, false);
    },
  });

  // Pane: Close
  commandRegistry.registerCommand({
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
      closePane(targetTabId, targetPaneId);
    },
  });

  // Pane: Split Left
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_SPLIT_LEFT,
    title: "Split Pane Left",
    description: "Create a new pane to the left of the current pane",
    category: "Pane",
    keybinding: {
      key: "Cmd+Shift+Left",
    },
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
  });

  // Pane: Split Right
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_SPLIT_RIGHT,
    title: "Split Pane Right",
    description: "Create a new pane to the right of the current pane",
    category: "Pane",
    keybinding: {
      key: "Cmd+Shift+Right",
    },
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
  });

  // Pane: Split Top
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_SPLIT_TOP,
    title: "Split Pane Top",
    description: "Create a new pane above the current pane",
    category: "Pane",
    keybinding: {
      key: "Cmd+Shift+Up",
    },
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
  });

  // Pane: Split Bottom
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_SPLIT_BOTTOM,
    title: "Split Pane Bottom",
    description: "Create a new pane below the current pane",
    category: "Pane",
    keybinding: {
      key: "Cmd+Shift+Down",
    },
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
  });

  // Pane: Split Left with Agent Session
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_SPLIT_LEFT_AGENT,
    title: "Split Pane Left (Agent Session)",
    description: "Create a new pane to the left with an isolated agent session",
    category: "Pane",
    keybinding: {
      key: "Cmd+Shift+Ctrl+Left",
    },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/split_agent_session",
      order: 1,
      when: hasGitRepo.isTrue(),
      title: "Left",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        void splitPaneWithAgentSession(targetTabId, targetPaneId, "row", true);
      }
    },
  });

  // Pane: Split Right with Agent Session
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_SPLIT_RIGHT_AGENT,
    title: "Split Pane Right (Agent Session)",
    description:
      "Create a new pane to the right with an isolated agent session",
    category: "Pane",
    keybinding: {
      key: "Cmd+Shift+Ctrl+Right",
    },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/split_agent_session",
      order: 2,
      when: hasGitRepo.isTrue(),
      title: "Right",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        void splitPaneWithAgentSession(targetTabId, targetPaneId, "row");
      }
    },
  });

  // Pane: Split Top with Agent Session
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_SPLIT_TOP_AGENT,
    title: "Split Pane Top (Agent Session)",
    description: "Create a new pane above with an isolated agent session",
    category: "Pane",
    keybinding: {
      key: "Cmd+Shift+Ctrl+Up",
    },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/split_agent_session",
      order: 3,
      when: hasGitRepo.isTrue(),
      title: "Top",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        void splitPaneWithAgentSession(
          targetTabId,
          targetPaneId,
          "column",
          true,
        );
      }
    },
  });

  // Pane: Split Bottom with Agent Session
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_SPLIT_BOTTOM_AGENT,
    title: "Split Pane Bottom (Agent Session)",
    description: "Create a new pane below with an isolated agent session",
    category: "Pane",
    keybinding: {
      key: "Cmd+Shift+Ctrl+Down",
    },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/split_agent_session",
      order: 4,
      when: hasGitRepo.isTrue(),
      title: "Bottom",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        void splitPaneWithAgentSession(targetTabId, targetPaneId, "column");
      }
    },
  });

  // Pane: Move Left
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_MOVE_LEFT,
    title: "Move Pane Left",
    description: "Move the current pane to the left",
    category: "Pane",
    keybinding: {
      key: "Cmd+Alt+Left",
    },
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
  });

  // Pane: Move Right
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_MOVE_RIGHT,
    title: "Move Pane Right",
    description: "Move the current pane to the right",
    category: "Pane",
    keybinding: {
      key: "Cmd+Alt+Right",
    },
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
  });

  // Pane: Move Up
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_MOVE_UP,
    title: "Move Pane Up",
    description: "Move the current pane upward",
    category: "Pane",
    keybinding: {
      key: "Cmd+Alt+Up",
    },
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
  });

  // Pane: Move Down
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_MOVE_DOWN,
    title: "Move Pane Down",
    description: "Move the current pane downward",
    category: "Pane",
    keybinding: {
      key: "Cmd+Alt+Down",
    },
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
  });

  // Pane: Move to New Tab
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_MOVE_TO_TAB,
    title: "Move Pane to New Tab",
    description: "Move the current pane to a new tab",
    category: "Pane",
    keybinding: {
      key: "Cmd+Alt+T",
    },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "1_pane",
      order: 2,
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        movePaneToTab(targetTabId, targetPaneId);
      }
    },
  });

  // Pane: Clone
  commandRegistry.registerCommand({
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
      cloneTerminalPane(targetTabId, targetPaneId);
    },
  });

  // Pane: Open Web Page
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_OPEN_WEB_PAGE,
    title: "Open Web Page",
    description: "Open a web page in a split view",
    category: "Pane",
    keybinding: {
      key: "Cmd+L",
    },
    when: hasActivePane.isTrue(),
    run: (context) => {
      handleOpenWebPage(context.setIsUrlDialogOpen);
    },
  });

  // Pane: Split Left with Browser
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_SPLIT_LEFT_BROWSER,
    title: "Split Browser Left",
    description: "Create a new browser pane to the left of the current pane",
    category: "Pane",
    keybinding: {
      key: "Cmd+Shift+B+Left",
    },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/split_browser",
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
  });

  // Pane: Split Right with Browser
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_SPLIT_RIGHT_BROWSER,
    title: "Split Browser Right",
    description: "Create a new browser pane to the right of the current pane",
    category: "Pane",
    keybinding: {
      key: "Cmd+Shift+B+Right",
    },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/split_browser",
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
  });

  // Pane: Split Top with Browser
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_SPLIT_TOP_BROWSER,
    title: "Split Browser Top",
    description: "Create a new browser pane above the current pane",
    category: "Pane",
    keybinding: {
      key: "Cmd+Shift+B+Up",
    },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/split_browser",
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
  });

  // Pane: Split Bottom with Browser
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_SPLIT_BOTTOM_BROWSER,
    title: "Split Browser Bottom",
    description: "Create a new browser pane below the current pane",
    category: "Pane",
    keybinding: {
      key: "Cmd+Shift+B+Down",
    },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/split_browser",
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
  });

  // Pane: Split Left with Editor
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_SPLIT_LEFT_EDITOR,
    title: "Split Editor Left",
    description: "Create a new editor pane to the left of the current pane",
    category: "Pane",
    keybinding: {
      key: "Cmd+Shift+E+Left",
    },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/split_editor",
      order: 1,
      title: "Left",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId && context.activeTab) {
        const sourcePane = context.activeTab.panes[targetPaneId];
        const cwd =
          sourcePane?.type === "terminal" || sourcePane?.type === "editor"
            ? sourcePane.cwd
            : null;
        if (cwd) {
          openEditorPane(targetTabId, targetPaneId, cwd, "row", true);
        }
      }
    },
  });

  // Pane: Split Right with Editor
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_SPLIT_RIGHT_EDITOR,
    title: "Split Editor Right",
    description: "Create a new editor pane to the right of the current pane",
    category: "Pane",
    keybinding: {
      key: "Cmd+Shift+E+Right",
    },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/split_editor",
      order: 2,
      title: "Right",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId && context.activeTab) {
        const sourcePane = context.activeTab.panes[targetPaneId];
        const cwd =
          sourcePane?.type === "terminal" || sourcePane?.type === "editor"
            ? sourcePane.cwd
            : null;
        if (cwd) {
          openEditorPane(targetTabId, targetPaneId, cwd, "row", false);
        }
      }
    },
  });

  // Pane: Split Top with Editor
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_SPLIT_TOP_EDITOR,
    title: "Split Editor Top",
    description: "Create a new editor pane above the current pane",
    category: "Pane",
    keybinding: {
      key: "Cmd+Shift+E+Up",
    },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/split_editor",
      order: 3,
      title: "Top",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId && context.activeTab) {
        const sourcePane = context.activeTab.panes[targetPaneId];
        const cwd =
          sourcePane?.type === "terminal" || sourcePane?.type === "editor"
            ? sourcePane.cwd
            : null;
        if (cwd) {
          openEditorPane(targetTabId, targetPaneId, cwd, "column", true);
        }
      }
    },
  });

  // Pane: Split Bottom with Editor
  commandRegistry.registerCommand({
    id: ApplicationCommands.PANE_SPLIT_BOTTOM_EDITOR,
    title: "Split Editor Bottom",
    description: "Create a new editor pane below the current pane",
    category: "Pane",
    keybinding: {
      key: "Cmd+Shift+E+Down",
    },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/split_editor",
      order: 4,
      title: "Bottom",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId && context.activeTab) {
        const sourcePane = context.activeTab.panes[targetPaneId];
        const cwd =
          sourcePane?.type === "terminal" || sourcePane?.type === "editor"
            ? sourcePane.cwd
            : null;
        if (cwd) {
          openEditorPane(targetTabId, targetPaneId, cwd, "column", false);
        }
      }
    },
  });

  // Terminal: Create VM
  commandRegistry.registerCommand({
    id: ApplicationCommands.TERMINAL_CREATE_CLOUD,
    title: "New Cloud Terminal",
    description: "Create a new cloud terminal",
    category: "Terminal",
    when: hasActivePane.isTrue(),
    run: () => {
      void handleCreateVM();
    },
  });

  // Terminal: Open in VS Code
  commandRegistry.registerCommand({
    id: ApplicationCommands.TERMINAL_OPEN_IN_VSCODE,
    title: "Open in VS Code",
    description: "Open the active directory in Visual Studio Code",
    category: "Terminal",
    when: When.and(activePaneType.equals("terminal"), hasCwd.isTrue()),
    run: (context) => {
      void handleOpenInVSCode(context.activeTab);
    },
  });

  // Agent: Launch
  commandRegistry.registerCommand({
    id: ApplicationCommands.AGENT_LAUNCH,
    title: "Launch Agents",
    description:
      "Open agent launcher to split panes or worktrees and start agents with a prompt",
    category: "Agent",
    keybinding: {
      key: "Cmd+I",
    },
    when: When.and(hasActivePane.isTrue(), activePaneType.equals("terminal")),
    run: (context) => {
      if (context.setShowAgentLauncher) {
        context.setShowAgentLauncher(true);
      }
    },
  });

  // Agent: Manage Sessions
  commandRegistry.registerCommand({
    id: ApplicationCommands.AGENT_MANAGE_SESSIONS,
    title: "Manage Agent Sessions",
    description: "Remove one or all agent worktrees without merging",
    category: "Agent",
    run: (context) => {
      void handleManageSessions(context);
    },
  });

  // Agent: Merge and Close
  commandRegistry.registerCommand({
    id: ApplicationCommands.AGENT_MERGE_AND_CLOSE,
    title: "Merge and Close Agent Session",
    description: "Commit, merge, and close the isolated agent worktree",
    category: "Agent",
    when: isInAgentSession.isTrue(),
    run: (context) => {
      void handleMergeAndClose(context.activeTab);
    },
  });

  // Agent: Terminate
  commandRegistry.registerCommand({
    id: ApplicationCommands.AGENT_TERMINATE,
    title: "Terminate Agent Session",
    description: "Remove the isolated worktree without merging",
    category: "Agent",
    when: isInAgentSession.isTrue(),
    run: (context) => {
      void handleTerminate(context.activeTab);
    },
  });

  // Agent: Delete All Worktrees
  commandRegistry.registerCommand({
    id: ApplicationCommands.AGENT_DELETE_ALL_WORKTREES,
    title: "Delete All Worktrees",
    description: "Delete all agent worktrees associated with this tab",
    category: "Agent",
    when: tabHasWorktrees.isTrue(),
    menu: {
      id: MenuId.TabContext,
      group: "4_tab",
      order: 0,
    },
    run: async (context, tabId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      if (!targetTabId) {
        return;
      }

      const tab = context.allTabs.find((t) => t.id === targetTabId);
      if (!tab) {
        return;
      }

      // Collect all unique agent session IDs from panes with worktrees
      const agentSessionIds = new Set<string>();
      for (const pane of Object.values(tab.panes)) {
        if (
          (pane.type === "terminal" || pane.type === "editor") &&
          pane.agentSessionId &&
          pane.agentWorktreePath
        ) {
          agentSessionIds.add(pane.agentSessionId);
        }
      }

      if (agentSessionIds.size === 0) {
        return;
      }

      // Show progress notification
      const notifId = enqueueNotification({
        kind: "info",
        message: `Deleting ${agentSessionIds.size} worktree${agentSessionIds.size > 1 ? "s" : ""}...`,
      });

      let successCount = 0;
      let errorCount = 0;

      // Delete each agent session
      for (const sessionId of agentSessionIds) {
        try {
          const result = await window.conduit.cleanupAgentSession({
            sessionId,
          });
          if (result.status === "success") {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          console.error(`Failed to delete agent session ${sessionId}:`, error);
          errorCount++;
        }
      }

      // Close all panes associated with deleted sessions
      for (const sessionId of agentSessionIds) {
        closeAgentSessionPanes(targetTabId, sessionId);
      }

      // Update notification with result
      if (errorCount === 0) {
        enqueueNotification({
          kind: "success",
          message: `Successfully deleted ${successCount} worktree${successCount > 1 ? "s" : ""}`,
          autoCloseMs: 3000,
        });
      } else {
        enqueueNotification({
          kind: "warning",
          message: `Deleted ${successCount} worktree${successCount > 1 ? "s" : ""}, ${errorCount} failed`,
          autoCloseMs: 5000,
        });
      }
    },
  });

  // ============================================================================
  // Editor Commands
  // ============================================================================

  // Editor: Toggle Sidebar
  commandRegistry.registerCommand({
    id: ApplicationCommands.EDITOR_TOGGLE_SIDEBAR,
    title: "Toggle File Tree",
    description: "Show or hide the file tree sidebar in the editor",
    category: "Editor",
    keybinding: {
      key: "Cmd+B",
    },
    when: activePaneType.equals("editor"),
    run: (context) => {
      if (context.activePaneId) {
        invokeEditorCommand(context.activePaneId, "toggleSidebar");
      }
    },
  });

  // Editor: Focus Sidebar
  commandRegistry.registerCommand({
    id: ApplicationCommands.EDITOR_FOCUS_SIDEBAR,
    title: "Focus File Tree",
    description: "Show and focus the file tree sidebar in the editor",
    category: "Editor",
    keybinding: {
      key: "Cmd+Shift+E",
    },
    when: activePaneType.equals("editor"),
    run: (context) => {
      if (context.activePaneId) {
        invokeEditorCommand(context.activePaneId, "focusSidebar");
      }
    },
  });

  // Register file tree commands
  registerFileTreeCommands(commandRegistry);
}

/**
 * Context builder for tab context menu
 *
 * Updates context keys based on the active pane in the tab.
 */
const tabContextBuilder: MenuContextBuilder = async (
  contextKeyService,
  params,
  checkGitRepo,
) => {
  const { tab } = params;

  // Get the active pane
  const activePane = tab.panes[tab.activePaneId];

  // Check git repository status for agent commands
  let hasGitRepoValue = false;
  if (
    activePane &&
    (activePane.type === "terminal" || activePane.type === "editor")
  ) {
    hasGitRepoValue = await checkGitRepo(activePane.cwd);
  }

  // Check if the tab has any panes with active worktrees
  let hasWorktreesValue = false;
  for (const pane of Object.values(tab.panes)) {
    if (
      (pane.type === "terminal" || pane.type === "editor") &&
      pane.agentWorktreePath
    ) {
      hasWorktreesValue = true;
      break;
    }
  }

  contextKeyService.setGlobal(hasGitRepo.key, hasGitRepoValue);
  contextKeyService.setGlobal(tabIsLocked.key, tab.locked);
  contextKeyService.setGlobal(tabHasWorktrees.key, hasWorktreesValue);
};

/**
 * Context builder for pane context menu
 *
 * Updates context keys based on the specific pane being right-clicked.
 */
const paneContextBuilder: MenuContextBuilder = async (
  contextKeyService,
  params,
  checkGitRepo,
) => {
  const { pane, tab } = params;

  // Check git repository status for agent commands
  let hasGitRepoValue = false;
  if (pane && (pane.type === "terminal" || pane.type === "editor")) {
    hasGitRepoValue = await checkGitRepo(pane.cwd);
  }

  contextKeyService.setGlobal(hasGitRepo.key, hasGitRepoValue);
  if (tab) {
    contextKeyService.setGlobal(tabIsLocked.key, tab.locked);
  }

  let isPaneCollapsed = false;
  let canPaneBeCollapsed = false;

  if (pane && tab) {
    // Find the pane in the layout tree and determine whether
    // it can be collapsed based on whether it has any sibling
    // panes that aren't already collapsed.
    walkLayout(tab.layout, ({ node, parent }) => {
      if (node.type === "pane" && node.paneId === pane.id) {
        isPaneCollapsed = Boolean(node.collapsed);
        canPaneBeCollapsed =
          parent?.children.length > 1 &&
          !parent.children.every(
            (child) =>
              child.id === node.id ||
              (child.type === "pane" && child.collapsed),
          );
        return false;
      }
    });
  }

  contextKeyService.setGlobal(paneIsCollapsed.key, isPaneCollapsed);
  contextKeyService.setGlobal(paneCanBeCollapsed.key, canPaneBeCollapsed);
};

/**
 * Register menu context builders for application menus
 *
 * This should be called during app initialization, after registering commands.
 */
export function registerMenuContextBuilders(): void {
  registerMenuContextBuilder(MenuId.TabContext, tabContextBuilder);
  registerMenuContextBuilder(MenuId.PaneContext, paneContextBuilder);

  // Register submenu labels
  registerSubmenu(
    MenuId.TabContext,
    "2_tab/duplicate_into",
    "Duplicate Tab into...",
  );

  registerSubmenu(
    MenuId.PaneContext,
    "3_split_more/split_browser",
    "Split browser...",
  );

  registerSubmenu(
    MenuId.PaneContext,
    "3_split_more/split_editor",
    "Split editor...",
  );

  registerSubmenu(
    MenuId.PaneContext,
    "3_split_more/split_agent_session",
    "Split agent session...",
  );
}
