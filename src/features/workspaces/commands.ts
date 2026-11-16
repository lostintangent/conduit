/**
 * Workspace commands
 */

import {
  hasWorkspace,
  quickPaneOpen,
} from "@/commands/contextKeys/appContextKeys";
import { When } from "@/commands";
import type { CommandDescriptor } from "@/commands/core/types";
import {
  handleCloseWorkspace,
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
    // Restoring tabs closes the quick ones too, unsaved text and all
    when: When.and(hasWorkspace.isTrue(), quickPaneOpen.isFalse()),
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
    when: quickPaneOpen.isFalse(),
    run: (context) => {
      context.setShowWorkspacePicker?.(true);
    },
  },
] satisfies CommandDescriptor[];
