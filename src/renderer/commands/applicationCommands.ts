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
  hasLastWorkspace,
  hasWorkspace,
  isInAgentSession,
  tabCount,
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
  handleShowConnectToVMDialog,
  handleTerminate,
  handleToggleDesignMode,
} from "@/commands/handlers";
import { toggleFocusMode } from "@/store/actions/focusMode";
import { closeTab, duplicateTab, openTab } from "@/store/actions/tab";
import { ApplicationCommands } from "@shared/commands";

// Re-export for convenience
export { ApplicationCommands };

/**
 * Register all application-level commands
 *
 * This should be called during app initialization, after the command
 * system has been initialized.
 */
export function registerApplicationCommands(
  commandRegistry: ICommandRegistry
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
        context.setApplicationMode
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

  // View: Open Pane Actions
  commandRegistry.registerCommand({
    id: ApplicationCommands.VIEW_OPEN_PANE_ACTIONS,
    title: "Open Pane Actions",
    description: "View and customize pane action bindings",
    category: "View",
    run: (context) => {
      context.view.openPaneActions();
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
        context.setShowCreateWorkspaceDialog
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
    when: tabCount.greaterThan(1),
    run: (context) => {
      if (context.activeTab) {
        closeTab(context.activeTab.id);
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
    run: (context) => {
      if (context.activeTab) {
        void duplicateTab(context.activeTab.id);
      }
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

  // Terminal: Connect to existing VM
  commandRegistry.registerCommand({
    id: ApplicationCommands.TERMINAL_CONNECT_TO_VM,
    title: "Connect to Existing VM",
    description: "Connect to an existing cloud VM terminal",
    category: "Terminal",
    run: (context) => {
      handleShowConnectToVMDialog(context.setShowConnectToVMDialog);
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
}
