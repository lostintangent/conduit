/**
 * Workspace command handlers
 *
 * Handlers for workspace-related commands including save, rename, close, and open.
 */

import {
  previousTabsSnapshotAtom,
  workspaceHasChangesAtom,
  workspaceNameAtom,
  workspacesAtom,
} from "@/store/atoms";
import type { Tab } from "@/types";
import type { Workspace } from "@shared/types";
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
  setShowCreateWorkspaceDialog: (show: boolean) => void
): Promise<void> {
  if (!activeTabId) {
    return;
  }

  const workspaceName = store.get(workspaceNameAtom);

  if (workspaceName) {
    const sessions = (await window.conduit.saveSession(
      workspaceName,
      tabs,
      activeTabId
    )) as Workspace[];

    store.set(workspacesAtom, sessions);

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
  setShowRenameWorkspaceDialog: (show: boolean) => void
): void {
  setShowRenameWorkspaceDialog(true);
}

/**
 * Duplicate the current workspace with a new name
 *
 * @param setShowDuplicateWorkspaceDialog - Function to show duplicate workspace dialog
 */
export function handleDuplicateWorkspace(
  setShowDuplicateWorkspaceDialog: (show: boolean) => void
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
  setShowWorkspacePicker: (show: boolean) => void
): void {
  setShowWorkspacePicker(true);
}

/**
 * Open the last workspace
 */
export async function handleOpenLastWorkspace(): Promise<void> {
  const lastWorkspace =
    (await window.conduit.loadLastWorkspace()) as Workspace | null;
  if (lastWorkspace) {
    const { openWorkspace } = await import("@/store/actions/workspace");
    await openWorkspace(lastWorkspace);
  }
}
