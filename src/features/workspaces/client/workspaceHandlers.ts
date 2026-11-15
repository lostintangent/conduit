/**
 * Workspace command handlers
 *
 * Handlers for the workspace commands that save and close workspaces.
 */

import { workspacesQuery } from "@features/workspaces/client/queries";
import { queryClient } from "@/query";

/**
 * Saves the open workspace now, or asks for a name for the anonymous one
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

  if (queryClient.getQueryData(workspacesQuery.queryKey)?.current) {
    const { flush } = await import("@features/workspaces/client/autosave");
    await flush();
  } else {
    setShowCreateWorkspaceDialog?.(true);
  }
}

/**
 * Go back to the anonymous workspace
 */
export async function handleCloseWorkspace(): Promise<void> {
  const { closeWorkspace } =
    await import("@features/workspaces/client/actions");
  await closeWorkspace();
}
