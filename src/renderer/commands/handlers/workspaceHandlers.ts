/**
 * Workspace command handlers
 *
 * Handlers for workspace-related commands including save, rename, close, and open.
 */

import {
  workspaceMutations,
  workspacesQuery,
} from "@features/workspaces/client/queries";
import { queryClient, runMutation } from "@/query";
import { workspaceNameAtom } from "@/store/atoms";

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
 * Rename the current workspace
 *
 * @param setShowRenameWorkspaceDialog - Function to show rename dialog
 */
export function handleRenameWorkspace(
  setShowRenameWorkspaceDialog?: (show: boolean) => void,
): void {
  setShowRenameWorkspaceDialog?.(true);
}

/**
 * Duplicate the current workspace with a new name
 *
 * @param setShowDuplicateWorkspaceDialog - Function to show duplicate workspace dialog
 */
export function handleDuplicateWorkspace(
  setShowDuplicateWorkspaceDialog?: (show: boolean) => void,
): void {
  setShowDuplicateWorkspaceDialog?.(true);
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
 * Open workspace picker dialog
 *
 * @param setShowWorkspacePicker - Function to show workspace picker
 */
export function handleOpenWorkspace(
  setShowWorkspacePicker?: (show: boolean) => void,
): void {
  setShowWorkspacePicker?.(true);
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
