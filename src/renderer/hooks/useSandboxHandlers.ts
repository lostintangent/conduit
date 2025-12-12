import {
  completeAgentSession,
  deleteAgentSession,
  splitPane,
} from "@/store/actions/pane";
import {
  enqueueNotification,
  updateNotification,
} from "@/store/actions/notifications";
import { useCallback } from "react";

type UseSandboxHandlersOptions = {
  tabId: string;
  paneId?: string;
};

/**
 * Handles completing an agent session (merging worktree back to base branch)
 */
export async function handleCompleteAgentSessionAction(
  tabId: string,
  agentSessionId: string,
) {
  try {
    const result = await completeAgentSession(tabId, agentSessionId);
    if (!result) {
      throw new Error("Failed to complete agent session");
    }

    if (result.status === "conflict") {
      enqueueNotification({
        kind: "error",
        message: "Merge conflict",
        details: result.message,
        persistent: true,
      });
    } else {
      enqueueNotification({
        kind: "success",
        message:
          result.status === "merged"
            ? "Agent session completed"
            : "No changes to merge",
        details: result.message,
        autoCloseMs: 3000,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    enqueueNotification({
      kind: "error",
      message: "Failed to complete agent session",
      details: errorMessage,
      autoCloseMs: 5000,
    });
    console.error("Failed to finalize agent session", error);
  }
}

/**
 * Handles deleting an agent session (removing worktree without merging)
 */
export async function handleDeleteAgentSessionAction(
  tabId: string,
  agentSessionId: string,
) {
  try {
    const result = await deleteAgentSession(tabId, agentSessionId);
    if (!result) {
      throw new Error("Failed to delete agent session");
    }

    enqueueNotification({
      kind: "success",
      message: "Agent session deleted",
      details: result.message,
      autoCloseMs: 3000,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    enqueueNotification({
      kind: "error",
      message: "Failed to delete agent session",
      details: errorMessage,
      autoCloseMs: 5000,
    });
    console.error("Failed to cleanup agent session", error);
  }
}

/**
 * Handles forking a VM and creating a new pane with the forked VM
 */
export async function handleForkVMAction(
  tabId: string,
  paneId: string,
  sandboxId: string,
) {
  const notificationId = enqueueNotification({
    kind: "info",
    message: "Forking VM...",
    persistent: true,
  });

  try {
    const forkedVM = await window.conduit.forkVM(sandboxId);

    if (!forkedVM) {
      throw new Error("Failed to fork VM");
    }

    await splitPane(tabId, paneId, "column", false, {
      terminalOptions: {
        existingVMId: forkedVM.id,
      },
    });

    updateNotification(notificationId, {
      kind: "success",
      message: "VM forked successfully",
      details: `New VM: ${forkedVM.id}`,
      autoCloseMs: 3000,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    updateNotification(notificationId, {
      kind: "error",
      message: "Failed to fork VM",
      details: errorMessage,
      autoCloseMs: 5000,
    });
    console.error("Failed to fork VM", error);
  }
}

/**
 * React hook that provides memoized handlers for sandbox operations
 */
export function useSandboxHandlers({
  tabId,
  paneId,
}: UseSandboxHandlersOptions) {
  const handleCompleteAgentSession = useCallback(
    async (agentSessionId: string) => {
      await handleCompleteAgentSessionAction(tabId, agentSessionId);
    },
    [tabId],
  );

  const handleDeleteAgentSession = useCallback(
    async (agentSessionId: string) => {
      await handleDeleteAgentSessionAction(tabId, agentSessionId);
    },
    [tabId],
  );

  const handleForkVM = useCallback(
    async (sandboxId: string) => {
      if (!paneId) {
        throw new Error("No pane ID available for forking VM");
      }
      await handleForkVMAction(tabId, paneId, sandboxId);
    },
    [tabId, paneId],
  );

  return {
    handleCompleteAgentSession,
    handleDeleteAgentSession,
    handleForkVM,
  };
}
