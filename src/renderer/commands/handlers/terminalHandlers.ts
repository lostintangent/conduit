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
  console.log("[handleCreateVM] User initiated cloud terminal creation");

  const notificationId = enqueueNotification({
    kind: "info",
    message: "Preparing cloud workspace...",
    persistent: true,
  });

  try {
    console.log("[handleCreateVM] Calling createTerminal API...");
    const result = await window.conduit.createTerminal({
      isRemoteVM: true,
    });

    if (!result) {
      throw new Error("Failed to create VM terminal");
    }

    console.log("[handleCreateVM] Terminal created, opening pane");

    updateNotification(notificationId, {
      kind: "success",
      message: "Cloud workspace ready",
      autoCloseMs: 2500,
    });

    openTabFromExistingSession({
      sessionId: result.sessionId,
      cwd: result.cwd,
      title: result.title,
      sandboxId: result.sandboxId ?? undefined,
    });

    console.log("[handleCreateVM] Pane opened successfully");
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
