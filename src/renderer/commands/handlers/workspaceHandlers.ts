/**
 * Workspace command handlers
 *
 * Handlers for workspace-related commands including save, rename, close, and open.
 */

import type { Tab } from "@/store/atoms";

/**
 * Save the current workspace
 *
 * @param tabs - All tabs
 * @param activeTabId - ID of the active tab
 * @param quickSaveWorkspace - Function to quick save workspace
 */
export async function handleSaveWorkspace(
  tabs: Tab[],
  activeTabId: string | undefined,
  quickSaveWorkspace: (tabs: Tab[], activeTabId: string) => Promise<void>
): Promise<void> {
  if (activeTabId) {
    await quickSaveWorkspace(tabs, activeTabId);
  }
}

/**
 * Rename the current workspace
 *
 * @param setShowRenameWorkspaceDialog - Function to show rename dialog
 */
export function handleRenameWorkspace(
  setShowRenameWorkspaceDialog: (show: boolean) => void
): void {
  setShowRenameWorkspaceDialog(true);
}

/**
 * Close the current workspace
 *
 * @param tabs - All tabs
 * @param activeTabId - ID of the active tab
 * @param closeWorkspace - Function to close workspace
 */
export function handleCloseWorkspace(
  tabs: Tab[],
  activeTabId: string | undefined,
  closeWorkspace: (tabs: Tab[], activeTabId: string | undefined) => void
): void {
  closeWorkspace(tabs, activeTabId);
}

/**
 * Open workspace picker dialog
 *
 * @param setShowWorkspacePicker - Function to show workspace picker
 */
export function handleOpenWorkspace(
  setShowWorkspacePicker: (show: boolean) => void
): void {
  setShowWorkspacePicker(true);
}

/**
 * Open the last workspace
 *
 * @param openLastWorkspace - Function to open last workspace
 */
export function handleOpenLastWorkspace(
  openLastWorkspace: () => void
): void {
  openLastWorkspace();
}
