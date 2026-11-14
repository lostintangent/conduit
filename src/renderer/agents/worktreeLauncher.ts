/**
 * Agent Worktree Launcher
 *
 * Handles launching multiple agent instances in worktrees or same folder with intelligent layout.
 */

import type { AgentConfig, AgentSessionInfo } from "@shared/types";
import { generateAgentLayout } from "@/utils/agentLayout";
import {
  enqueueNotification,
  updateNotification,
} from "@/store/actions/notifications";
import {
  inheritAgentSession,
  splitPane,
  updatePaneProperty,
} from "@/store/actions/pane";

export interface LaunchPayload {
  prompt: string;
  agentIds: string[];
  agentInstances?: {
    [agentId: string]: {
      count: number;
      instances?: { id: string; instructions?: string }[];
    };
  };
  launchTarget: "same-folder" | "worktree";
}

export interface WorktreeLaunchOptions {
  cwd: string;
  agents: AgentConfig[];
  api: {
    spawnAgentSession: (opts: {
      cwd: string;
      preferredName: string;
    }) => Promise<AgentSessionInfo | null>;
    terminal: Pick<typeof window.conduit.terminal, "create">;
  };
  onClose?: () => void;
}

function buildAgentCommand(
  interactiveCommand: string,
  prompt: string,
  instructions?: string,
): string {
  const argumentText = instructions ? `${prompt}\n\n${instructions}` : prompt;
  return interactiveCommand.replace(
    "{arg}",
    `"${argumentText.replace(/"/g, '\\"')}"`,
  );
}

/**
 * Launch multiple agent instances with intelligent layout, either each in its
 * own worktree (`launchTarget: "worktree"`) or all in the same folder.
 *
 * @param payload - Launch configuration with agents and prompt
 * @param options - Launch dependencies (cwd, agents, api, etc.)
 */
export async function launchAgents(
  payload: LaunchPayload,
  options: WorktreeLaunchOptions,
): Promise<void> {
  const { cwd, agents: agentConfigs, api, onClose } = options;
  const useWorktrees = payload.launchTarget === "worktree";

  // Calculate total number of agent instances to launch
  const totalInstances = payload.agentIds.reduce((sum, agentId) => {
    const count = payload.agentInstances?.[agentId]?.count ?? 1;
    return sum + count;
  }, 0);

  if (totalInstances === 0) {
    throw new Error("No agents selected to launch");
  }

  // Close the launcher dialog
  onClose?.();

  // Show progress notification
  const notifId = enqueueNotification({
    kind: "info",
    message: `Launching ${totalInstances} agent${totalInstances > 1 ? "s" : ""}...`,
  });

  try {
    // Create the first worktree (if any) and tab
    const firstAgentId = payload.agentIds[0];
    const firstAgent = agentConfigs.find((a) => a.id === firstAgentId);
    if (!firstAgent) {
      throw new Error(
        `Agent with ID "${firstAgentId}" not found in configuration. Available agents: ${agentConfigs.map((a) => a.id).join(", ")}`,
      );
    }
    if (!firstAgent.interactiveCommand) {
      throw new Error(
        `Agent ${firstAgent.name} has no interactive command configured`,
      );
    }

    const createdSessions: AgentSessionInfo[] = [];
    let firstCwd = cwd;
    if (useWorktrees) {
      const firstSession = await api.spawnAgentSession({
        cwd,
        preferredName: firstAgent.name,
      });
      if (!firstSession) {
        throw new Error("Failed to create first agent session");
      }
      createdSessions.push(firstSession);
      firstCwd = firstSession.worktreePath;
    }

    const firstInstances = payload.agentInstances?.[firstAgentId]
      ?.instances ?? [{ id: "1" }];
    const firstCommand = buildAgentCommand(
      firstAgent.interactiveCommand,
      payload.prompt,
      firstInstances[0]?.instructions,
    );

    const { openTabFromExistingSession } = await import("@/store/actions/tab");
    // Its tab may be split for more instances, so no other pane's size fits.
    const firstTerminal = await api.terminal.create({
      cwd: firstCwd,
      command: firstCommand,
      waitForSize: true,
    });
    if (!firstTerminal) {
      throw new Error(
        useWorktrees
          ? "Failed to create terminal in worktree"
          : "Failed to create first terminal",
      );
    }

    // Create the initial tab with the first agent
    const { tabId, paneId } = openTabFromExistingSession({
      sessionId: firstTerminal.sessionId,
      cwd: firstCwd,
      title: firstAgent.name,
    });

    if (useWorktrees) {
      updatePaneProperty(
        tabId,
        paneId,
        inheritAgentSession(createdSessions[0]),
      );
    }

    let currentPaneId = paneId;

    // Generate layout plan for all instances
    const layoutPlan = generateAgentLayout(totalInstances);
    let splitIndex = 0;

    // Create remaining instances
    for (const agentId of payload.agentIds) {
      const agent = agentConfigs.find((a) => a.id === agentId);
      if (!agent) {
        console.warn(
          `Skipping agent ${agentId}: not found in configuration. Available: ${agentConfigs.map((a) => a.id).join(", ")}`,
        );
        continue;
      }
      if (!agent.interactiveCommand) {
        console.warn(`Skipping agent ${agentId}: no interactive command`);
        continue;
      }

      const instanceConfig = payload.agentInstances?.[agentId];
      const instances = instanceConfig?.instances ?? [{ id: "1" }];
      const startIdx = agentId === firstAgentId ? 1 : 0;

      for (let i = startIdx; i < instances.length; i++) {
        const instance = instances[i];

        let session: AgentSessionInfo | undefined;
        if (useWorktrees) {
          // Create a new worktree for this instance
          session =
            (await api.spawnAgentSession({
              cwd,
              preferredName: agent.name,
            })) ?? undefined;
          if (!session) {
            console.error(
              `Failed to create session for ${agent.name} instance ${i + 1}`,
            );
            continue;
          }
          createdSessions.push(session);
        }

        // Get the split direction from layout plan
        const splitDirection = layoutPlan[splitIndex]?.direction ?? "row";
        splitIndex++;

        const command = buildAgentCommand(
          agent.interactiveCommand,
          payload.prompt,
          instance.instructions,
        );

        // Split the current pane and create a new terminal for the instance
        const newPane = await splitPane(
          tabId,
          currentPaneId,
          splitDirection,
          false,
          {
            terminalOptions: { cwd: session?.worktreePath ?? cwd, command },
            agentSession: session,
          },
        );

        if (!newPane) {
          console.error(
            `Failed to split pane for ${agent.name} instance ${i + 1}`,
          );
          continue;
        }

        currentPaneId = newPane.id;
      }
    }

    // Update notification
    const where = useWorktrees
      ? `${createdSessions.length} worktree${createdSessions.length > 1 ? "s" : ""}`
      : "same folder";
    updateNotification(notifId, {
      kind: "success",
      message: `Launched ${totalInstances} agent${totalInstances > 1 ? "s" : ""} in ${where}`,
    });
  } catch (error) {
    updateNotification(notifId, {
      kind: "error",
      message: `Launch failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    throw error;
  }
}
