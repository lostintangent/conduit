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
  VIEW_ENTER_FOCUS_MODE: 'view.enterFocusMode',
  VIEW_TOGGLE_PANE_CONTROLS: 'view.togglePaneControls',
} as const;

/**
 * Register all application-level commands
 *
 * This should be called during app initialization, after the command
 * system has been initialized.
 */
export function registerApplicationCommands(commandRegistry: ICommandRegistry): void {
  // View: Enter Focus Mode
  commandRegistry.registerCommand({
    id: ApplicationCommands.VIEW_ENTER_FOCUS_MODE,
    title: 'Enter Focus Mode',
    category: 'View',
    keybinding: {
      key: 'Cmd+Alt+F',
    },
    run: (context) => {
      if (context.activeTab) {
        context.view.enterFocusMode(context.activeTab.id, context.activeTab.activePaneId);
      }
    },
  });

  // View: Toggle Pane Controls
  commandRegistry.registerCommand({
    id: ApplicationCommands.VIEW_TOGGLE_PANE_CONTROLS,
    title: 'Toggle Pane Controls',
    category: 'View',
    keybinding: {
      key: 'Cmd+D',
    },
    run: (context) => {
      context.view.togglePaneControls();
    },
  });
}
