/**
 * Agent session command handlers
 *
 * Handlers for managing agent sessions including listing, merging, and terminating.
 */

import {
  enqueueNotification,
  updateNotification,
} from "@/store/actions/notifications";
import { completeAgentSession, deleteAgentSession } from "@/store/actions/pane";

/**
 * List all agent sessions and show management dialog
 *
 * @param context - Command context with agent service
 */
export async function handleManageSessions(context: any): Promise<void> {
  try {
    const sessions = await window.conduit.listAgentSessions();
    if (sessions.length === 0) {
      enqueueNotification({
        kind: "info",
        message: "No agent sessions.",
        autoCloseMs: 2500,
      });
      return;
    }

    context.agent.showManageSessionsDialog(sessions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    enqueueNotification({
      kind: "error",
      message: "Unable to list agent sessions",
      details: message,
      autoCloseMs: null,
    });
  }
}

/**
 * Merge and close an agent session
 *
 * @param activeTab - The active tab containing panes
 */
export async function handleMergeAndClose(activeTab: any): Promise<void> {
  const activePane =
    activeTab && activeTab.activePaneId
      ? activeTab.panes[activeTab.activePaneId]
      : undefined;

  if (
    !activePane ||
    activePane.type !== "terminal" ||
    !activePane.agentSessionId
  ) {
    return;
  }

  const branchLabel = activePane.agentBranchName ?? "agent session";
  const notificationId = enqueueNotification({
    kind: "info",
    message: `Merging ${branchLabel}...`,
    persistent: true,
  });

  try {
    const result = await completeAgentSession(
      activeTab.id,
      activePane.agentSessionId,
    );
    if (!result) {
      throw new Error("Unable to finalize agent session");
    }

    if (result.status === "conflict") {
      updateNotification(notificationId, {
        kind: "error",
        message: "Merge conflicts detected",
        details: result.message,
        autoCloseMs: null,
      });
      return;
    }

    updateNotification(notificationId, {
      kind: result.status === "noop" ? "info" : "success",
      message:
        result.status === "noop"
          ? "Agent session had no new commits."
          : "Agent session merged successfully.",
      details: result.message,
      autoCloseMs: 5000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateNotification(notificationId, {
      kind: "error",
      message: "Failed to merge and close agent session",
      details: message,
      autoCloseMs: null,
    });
  }
}

/**
 * Terminate an agent session without merging
 *
 * @param activeTab - The active tab containing panes
 */
export async function handleTerminate(activeTab: any): Promise<void> {
  const activePane =
    activeTab && activeTab.activePaneId
      ? activeTab.panes[activeTab.activePaneId]
      : undefined;

  if (
    !activePane ||
    activePane.type !== "terminal" ||
    !activePane.agentSessionId
  ) {
    return;
  }

  const branchLabel = activePane.agentBranchName ?? "agent session";
  const notificationId = enqueueNotification({
    kind: "info",
    message: `Cleaning up ${branchLabel}...`,
    persistent: true,
  });

  try {
    const result = await deleteAgentSession(
      activeTab.id,
      activePane.agentSessionId,
    );
    if (!result) {
      throw new Error("Unable to clean up agent session");
    }

    updateNotification(notificationId, {
      kind: "success",
      message: "Agent session terminated",
      details: result.message,
      autoCloseMs: 4000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateNotification(notificationId, {
      kind: "error",
      message: "Failed to clean up agent session",
      details: message,
      autoCloseMs: null,
    });
  }
}
