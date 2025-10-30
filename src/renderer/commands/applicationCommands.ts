/**
 * Application-level command registrations
 *
 * This module contains all application-level commands that interact with
 * the app's UI state (focus mode, pane controls, etc.).
 */

import type { ICommandRegistry } from "@/commands";

/**
 * Type-safe command IDs for application commands
 */
export const ApplicationCommands = {
  VIEW_TOGGLE_FOCUS_MODE: 'view.toggleFocusMode',
  VIEW_TOGGLE_DESIGN_MODE: 'view.toggleDesignMode',
  VIEW_OPEN_KEYBOARD_SHORTCUTS: 'view.openKeyboardShortcuts',
  VIEW_SHOW_COMMAND_PALETTE: 'view.showCommandPalette',
  WORKSPACE_SAVE: 'workspace.save',
  WORKSPACE_RENAME: 'workspace.rename',
  WORKSPACE_CLOSE: 'workspace.close',
} as const;

/**
 * Register all application-level commands
 *
 * This should be called during app initialization, after the command
 * system has been initialized.
 */
export function registerApplicationCommands(commandRegistry: ICommandRegistry): void {
  // View: Toggle Focus Mode
  commandRegistry.registerCommand({
    id: ApplicationCommands.VIEW_TOGGLE_FOCUS_MODE,
    title: 'Toggle Focus Mode',
    description: 'Zoom into a single pane or return to normal view',
    category: 'View',
    keybinding: {
      key: 'Cmd+Alt+F',
    },
    run: (context) => {
      if (context.activeTab) {
        context.view.toggleFocusMode(context.activeTab.id, context.activeTab.activePaneId);
      }
    },
  });

  // View: Toggle Design Mode
  commandRegistry.registerCommand({
    id: ApplicationCommands.VIEW_TOGGLE_DESIGN_MODE,
    title: 'Toggle Design Mode',
    description: 'Show or hide pane control buttons for layout manipulation',
    category: 'View',
    keybinding: {
      key: 'Cmd+D',
    },
    run: (context) => {
      context.view.toggleDesignMode();
    },
  });

  // View: Open Keyboard Shortcuts
  commandRegistry.registerCommand({
    id: ApplicationCommands.VIEW_OPEN_KEYBOARD_SHORTCUTS,
    title: 'Keyboard Shortcuts',
    description: 'View and customize keyboard shortcuts',
    category: 'View',
    keybinding: {
      key: 'Cmd+K Cmd+S',
    },
    run: (context) => {
      context.view.openKeyboardShortcuts();
    },
  });

  // View: Show Command Palette
  commandRegistry.registerCommand({
    id: ApplicationCommands.VIEW_SHOW_COMMAND_PALETTE,
    title: 'Show Command Palette',
    description: 'Show all available commands',
    category: 'View',
    keybinding: {
      key: 'Cmd+Shift+P',
    },
    run: (context) => {
      context.view.showCommandPalette();
    },
  });

  // Workspace: Save
  commandRegistry.registerCommand({
    id: ApplicationCommands.WORKSPACE_SAVE,
    title: 'Save Workspace',
    description: 'Save current tab layout for later restoration',
    category: 'Workspace',
    keybinding: {
      key: 'Cmd+K Cmd+W',
    },
    run: (context) => {
      context.workspace.saveWorkspace();
    },
  });

  // Workspace: Rename
  commandRegistry.registerCommand({
    id: ApplicationCommands.WORKSPACE_RENAME,
    title: 'Rename Workspace',
    description: 'Change the name of the current workspace',
    category: 'Workspace',
    keybinding: {
      key: 'Cmd+K Cmd+R',
    },
    run: (context) => {
      if (context.workspaceName) {
        context.workspace.renameWorkspace();
      }
    },
  });

  // Workspace: Close
  commandRegistry.registerCommand({
    id: ApplicationCommands.WORKSPACE_CLOSE,
    title: 'Close Workspace',
    description: 'Close the current workspace',
    category: 'Workspace',
    keybinding: {
      key: 'Cmd+K Cmd+C',
    },
    run: (context) => {
      if (context.workspaceName) {
        context.workspace.closeWorkspace();
      }
    },
  });
}
