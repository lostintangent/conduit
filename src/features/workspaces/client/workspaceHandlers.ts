/**
 * Workspace command handlers
 *
 * Handlers for the workspace commands that save, close and reopen workspaces.
 */

import {
  workspaceMutations,
  workspacesQuery,
} from "@features/workspaces/client/queries";
import { queryClient, runMutation } from "@/query";
import { workspaceNameAtom } from "@features/workbench/client/atoms";

/**
 * Save the open workspace, or ask for a name when none is open
 *
 * @param activeTabId - ID of the active tab
 * @param setShowCreateWorkspaceDialog - Function to show create workspace dialog
 */
export async function handleSaveWorkspace(
  activeTabId: string | undefined,
  setShowCreateWorkspaceDialog?: (show: boolean) => void,
): Promise<void> {
  if (!activeTabId) {
    return;
  }

  if (workspaceNameAtom.get()) {
    await runMutation(workspaceMutations.save(), undefined);
  } else {
    setShowCreateWorkspaceDialog?.(true);
  }
}

/**
 * Close the current workspace
 */
export async function handleCloseWorkspace(): Promise<void> {
  const { closeWorkspace } =
    await import("@features/workspaces/client/actions");
  closeWorkspace();
}

/**
 * Open the last workspace
 */
export async function handleOpenLastWorkspace(): Promise<void> {
  const state = await queryClient.ensureQueryData(workspacesQuery);
  if (state.lastWorkspace) {
    const { openWorkspace } =
      await import("@features/workspaces/client/actions");
    await openWorkspace(state.lastWorkspace);
  }
}
