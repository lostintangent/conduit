/**
 * Workspace commands
 */

import {
  hasLastWorkspace,
  hasWorkspace,
} from "@/commands/contextKeys/appContextKeys";
import type { CommandDescriptor } from "@/commands/core/types";
import {
  handleCloseWorkspace,
  handleOpenLastWorkspace,
  handleSaveWorkspace,
} from "@features/workspaces/client/workspaceHandlers";
import { ApplicationCommands } from "@shared/commands";

export default [
  // Workspace: Save
  {
    id: ApplicationCommands.WORKSPACE_SAVE,
    title: "Save Workspace",
    description: "Save current tab layout for later restoration",
    category: "Workspace",
    keybinding: { key: "Cmd+K Cmd+W" },
    run: (context) => {
      void handleSaveWorkspace(
        context.activeTab?.id,
        context.setShowCreateWorkspaceDialog,
      );
    },
  },

  // Workspace: Rename
  {
    id: ApplicationCommands.WORKSPACE_RENAME,
    title: "Rename Workspace",
    description: "Change the name of the current workspace",
    category: "Workspace",
    keybinding: { key: "Cmd+K Cmd+R" },
    when: hasWorkspace.isTrue(),
    run: (context) => {
      if (context.workspaceName) {
        context.setShowRenameWorkspaceDialog?.(true);
      }
    },
  },

  // Workspace: Duplicate
  {
    id: ApplicationCommands.WORKSPACE_DUPLICATE,
    title: "Duplicate Workspace",
    description: "Create a copy of the current workspace with a new name",
    category: "Workspace",
    when: hasWorkspace.isTrue(),
    run: (context) => {
      if (context.workspaceName) {
        context.setShowDuplicateWorkspaceDialog?.(true);
      }
    },
  },

  // Workspace: Close
  {
    id: ApplicationCommands.WORKSPACE_CLOSE,
    title: "Close Workspace",
    description: "Close the current workspace",
    category: "Workspace",
    keybinding: { key: "Cmd+K F" },
    when: hasWorkspace.isTrue(),
    run: (context) => {
      if (context.workspaceName) {
        void handleCloseWorkspace();
      }
    },
  },

  // Workspace: Open
  {
    id: ApplicationCommands.WORKSPACE_OPEN,
    title: "Open Workspace",
    description: "Restore tabs from a saved workspace",
    category: "Workspace",
    keybinding: { key: "Cmd+K Cmd+O" },
    run: (context) => {
      context.setShowWorkspacePicker?.(true);
    },
  },

  // Workspace: Open Last
  {
    id: ApplicationCommands.WORKSPACE_OPEN_LAST,
    title: "Continue Last Session",
    description: "Restore your workspace from when you last closed the app",
    category: "Workspace",
    when: hasLastWorkspace.isTrue(),
    run: () => {
      void handleOpenLastWorkspace();
    },
  },
] satisfies CommandDescriptor[];
