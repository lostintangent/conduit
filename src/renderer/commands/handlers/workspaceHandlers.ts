/**
 * Workspace command handlers
 *
 * Handlers for workspace-related commands including save, rename, close, and open.
 */

import {
  previousTabsSnapshotAtom,
  workspaceHasChangesAtom,
  workspaceNameAtom,
  workspaceStateAtom,
} from "@/store/atoms";
import type { Tab } from "@/types";
import { getDefaultStore } from "jotai";

const store = getDefaultStore();

/**
 * Save the current workspace
 *
 * @param tabs - All tabs
 * @param activeTabId - ID of the active tab
 * @param setShowCreateWorkspaceDialog - Function to show create workspace dialog
 */
export async function handleSaveWorkspace(
  tabs: Tab[],
  activeTabId: string | undefined,
  setShowCreateWorkspaceDialog: (show: boolean) => void,
): Promise<void> {
  if (!activeTabId) {
    return;
  }

  const workspaceName = store.get(workspaceNameAtom);

  if (workspaceName) {
    const state = await window.conduit.workspace.saveWorkspace(
      workspaceName,
      tabs,
      activeTabId,
    );

    store.set(workspaceStateAtom, state);

    // Reset the has changes flag and update the reference snapshot after successful save
    const savedSnapshot = JSON.stringify(tabs);
    store.set(previousTabsSnapshotAtom, savedSnapshot);
    store.set(workspaceHasChangesAtom, false);
  } else {
    setShowCreateWorkspaceDialog(true);
  }
}

/**
 * Rename the current workspace
 *
 * @param setShowRenameWorkspaceDialog - Function to show rename dialog
 */
export function handleRenameWorkspace(
  setShowRenameWorkspaceDialog: (show: boolean) => void,
): void {
  setShowRenameWorkspaceDialog(true);
}

/**
 * Duplicate the current workspace with a new name
 *
 * @param setShowDuplicateWorkspaceDialog - Function to show duplicate workspace dialog
 */
export function handleDuplicateWorkspace(
  setShowDuplicateWorkspaceDialog: (show: boolean) => void,
): void {
  setShowDuplicateWorkspaceDialog(true);
}

/**
 * Close the current workspace
 */
export async function handleCloseWorkspace(): Promise<void> {
  const { closeWorkspace } = await import("@/store/actions/workspace");
  closeWorkspace();
}

/**
 * Open workspace picker dialog
 *
 * @param setShowWorkspacePicker - Function to show workspace picker
 */
export function handleOpenWorkspace(
  setShowWorkspacePicker: (show: boolean) => void,
): void {
  setShowWorkspacePicker(true);
}

/**
 * Open the last workspace
 */
export async function handleOpenLastWorkspace(): Promise<void> {
  const state = await window.conduit.workspace.getState();
  if (state.lastWorkspace) {
    const { openWorkspace } = await import("@/store/actions/workspace");
    await openWorkspace(state.lastWorkspace);
  }
}
