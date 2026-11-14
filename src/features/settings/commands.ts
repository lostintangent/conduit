/**
 * Commands that open a tab of the settings dialog
 */

import type { CommandDescriptor } from "@/commands/core/types";
import { ApplicationCommands } from "@shared/commands";

export default [
  // View: Open Settings
  {
    id: ApplicationCommands.VIEW_OPEN_SETTINGS,
    title: "Settings",
    description: "Open application settings",
    category: "View",
    keybinding: { key: "Cmd+," },
    run: (context) => {
      context.setShowGeneralSettings?.(true);
    },
  },

  // View: Open Keyboard Shortcuts
  {
    id: ApplicationCommands.VIEW_OPEN_KEYBINDINGS,
    title: "Keyboard Shortcuts",
    description: "View and customize keyboard shortcuts",
    category: "View",
    keybinding: { key: "Cmd+K Cmd+S" },
    run: (context) => {
      context.setShowKeybindingsEditor?.(true);
    },
  },

  // View: Manage Pane Actions
  {
    id: ApplicationCommands.VIEW_OPEN_PANE_ACTIONS,
    title: "Pane Actions",
    description: "Customize the action available in design mode",
    category: "View",
    run: (context) => {
      context.view.openPaneActions();
    },
  },

  // View: Manage Agents
  {
    id: ApplicationCommands.VIEW_OPEN_AGENTS,
    title: "Agent Teams",
    description: "Configure AI agents for terminal prompt mode (Cmd+/)",
    category: "View",
    run: (context) => {
      context.view.openAgents();
    },
  },
] satisfies CommandDescriptor[];
