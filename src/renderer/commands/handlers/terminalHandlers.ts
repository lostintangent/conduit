/**
 * Terminal command handlers
 *
 * Handlers for terminal-related commands like creating VMs and opening in VS Code.
 */

import {
  enqueueNotification,
  updateNotification,
} from "@/store/actions/notifications";
import { openTabFromExistingSession } from "@/store/actions/tab";

/**
 * Create a new VM terminal
 */
export async function handleCreateVM(): Promise<void> {
  const notificationId = enqueueNotification({
    kind: "info",
    message: "Creating VM...",
    persistent: true,
  });

  try {
    const result = await window.conduit.createTerminal({
      isRemoteVM: true,
    });

    if (!result) {
      throw new Error("Failed to create VM terminal");
    }

    updateNotification(notificationId, {
      kind: "success",
      message: "VM created successfully",
      autoCloseMs: 2500,
    });

    openTabFromExistingSession({
      sessionId: result.sessionId,
      cwd: result.cwd,
      title: result.title,
      vmMetadata: result.vmMetadata ?? undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateNotification(notificationId, {
      kind: "error",
      message: "Failed to create VM terminal",
      details: message,
      autoCloseMs: null,
    });
  }
}

/**
 * Connect to an existing VM terminal
 * 
 * @param vmId - The VM ID to connect to
 */
export async function handleConnectToVM(vmId: string): Promise<void> {
  const notificationId = enqueueNotification({
    kind: "info",
    message: `Connecting to VM ${vmId}...`,
    persistent: true,
  });

  try {
    const result = await window.conduit.createTerminal({
      existingVMId: vmId,
    });

    if (!result) {
      throw new Error("Failed to connect to VM terminal");
    }

    updateNotification(notificationId, {
      kind: "success",
      message: "Connected to VM successfully",
      autoCloseMs: 2500,
    });

    openTabFromExistingSession({
      sessionId: result.sessionId,
      cwd: result.cwd,
      title: result.title,
      vmMetadata: result.vmMetadata ?? undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateNotification(notificationId, {
      kind: "error",
      message: "Failed to connect to VM terminal",
      details: message,
      autoCloseMs: null,
    });
  }
}

/**
 * Show the Connect to VM dialog
 * 
 * @param setShowConnectToVMDialog - Function to show the dialog
 */
export function handleShowConnectToVMDialog(
  setShowConnectToVMDialog: (show: boolean) => void
): void {
  setShowConnectToVMDialog(true);
}

/**
 * Open the current working directory in VS Code
 *
 * @param activeTab - The active tab containing panes
 */
export async function handleOpenInVSCode(activeTab: any): Promise<void> {
  const activePane =
    activeTab && activeTab.activePaneId
      ? activeTab.panes[activeTab.activePaneId]
      : undefined;

  if (activePane?.type === "terminal" && activePane.cwd) {
    await window.conduit.runBackgroundCommand({
      command: "code-insiders",
      args: [activePane.cwd],
      cwd: activePane.cwd,
    });
  }
}
