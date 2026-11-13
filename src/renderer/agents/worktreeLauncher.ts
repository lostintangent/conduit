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
    createTerminal: (opts: {
      cwd: string;
    }) => Promise<{ sessionId: string } | null>;
    sendKeypress: (sessionId: string, data: string) => void;
  };
  onClose?: () => void;
}

/**
 * Launch multiple agent instances in worktrees with intelligent layout
 *
 * @param payload - Launch configuration with agents and prompt
 * @param options - Launch dependencies (cwd, agents, api, etc.)
 */
export async function launchAgentsInWorktrees(
  payload: LaunchPayload,
  options: WorktreeLaunchOptions,
): Promise<void> {
  const { cwd, agents: agentConfigs, api, onClose } = options;

  console.log("[WorktreeLauncher] Launching with config:", {
    requestedAgents: payload.agentIds,
    availableAgents: agentConfigs.map((a) => a.id),
    agentConfigs: agentConfigs,
  });

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
    // Create the first worktree and tab
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

    const firstSession = await api.spawnAgentSession({
      cwd,
      preferredName: firstAgent.name,
    });
    if (!firstSession) {
      throw new Error("Failed to create first agent session");
    }

    // Create a new terminal in the worktree
    const firstTerminal = await api.createTerminal({
      cwd: firstSession.worktreePath,
    });
    if (!firstTerminal) {
      throw new Error("Failed to create terminal in worktree");
    }

    // Create the initial tab with the first agent
    const { openTabFromExistingSession } = await import("@/store/actions/tab");
    const tabResult = await openTabFromExistingSession({
      sessionId: firstTerminal.sessionId,
      cwd: firstSession.worktreePath,
      title: firstAgent.name,
    });
    if (!tabResult) {
      throw new Error("Failed to create tab");
    }

    const { tabId, paneId } = tabResult;

    updatePaneProperty(tabId, paneId, inheritAgentSession(firstSession));

    // Send the interactive command for the first agent
    const firstInstances = payload.agentInstances?.[firstAgentId]
      ?.instances ?? [{ id: "1" }];
    const firstInstanceInstructions = firstInstances[0]?.instructions;
    const argumentText = firstInstanceInstructions
      ? `${payload.prompt}\n\n${firstInstanceInstructions}`
      : payload.prompt;
    const firstCommand = firstAgent.interactiveCommand.replace(
      "{arg}",
      `"${argumentText.replace(/"/g, '\\"')}"`,
    );

    console.log("[WorktreeLauncher] First agent command:", {
      agentId: firstAgentId,
      agentName: firstAgent.name,
      template: firstAgent.interactiveCommand,
      instructions: firstInstanceInstructions,
      finalCommand: firstCommand,
    });

    setTimeout(() => {
      api.sendKeypress(firstTerminal.sessionId, firstCommand + "\r");
    }, 100);

    // Track all created sessions
    const createdSessions: AgentSessionInfo[] = [firstSession];
    let currentPaneId = paneId;
    let instanceIndex = 1;

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

        // Create a new worktree for this instance
        const session = await api.spawnAgentSession({
          cwd,
          preferredName: agent.name,
        });
        if (!session) {
          console.error(
            `Failed to create session for ${agent.name} instance ${i + 1}`,
          );
          continue;
        }
        createdSessions.push(session);

        // Get the split direction from layout plan
        const splitDirection = layoutPlan[splitIndex]?.direction ?? "row";
        splitIndex++;

        // Split the current pane and create a new terminal in the worktree
        const newPane = await splitPane(
          tabId,
          currentPaneId,
          splitDirection,
          false,
          {
            terminalOptions: { cwd: session.worktreePath },
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
        // Send the interactive command with custom instructions
        const argumentText = instance.instructions
          ? `${payload.prompt}\n\n${instance.instructions}`
          : payload.prompt;
        const command = agent.interactiveCommand.replace(
          "{arg}",
          `"${argumentText.replace(/"/g, '\\"')}"`,
        );

        console.log(
          `[WorktreeLauncher] Agent ${agent.name} instance ${i + 1} command:`,
          {
            agentId,
            agentName: agent.name,
            template: agent.interactiveCommand,
            instructions: instance.instructions,
            finalCommand: command,
          },
        );

        setTimeout(
          () => {
            api.sendKeypress(newPane.sessionId, command + "\r");
          },
          100 * (instanceIndex + 1),
        );

        instanceIndex++;
      }
    }

    // Update notification
    updateNotification(notifId, {
      kind: "success",
      message: `Launched ${totalInstances} agent${totalInstances > 1 ? "s" : ""} in ${createdSessions.length} worktree${createdSessions.length > 1 ? "s" : ""}`,
    });
  } catch (error) {
    updateNotification(notifId, {
      kind: "error",
      message: `Launch failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    throw error;
  }
}

/**
 * Launch multiple agent instances in the same folder without creating worktrees
 *
 * @param payload - Launch configuration with agents and prompt
 * @param options - Launch dependencies (cwd, agents, api, etc.)
 */
export async function launchAgentsInSameFolder(
  payload: LaunchPayload,
  options: Omit<WorktreeLaunchOptions, "api"> & {
    api: Omit<WorktreeLaunchOptions["api"], "spawnAgentSession">;
  },
): Promise<void> {
  const { cwd, agents: agentConfigs, api, onClose } = options;

  console.log("[SameFolderLauncher] Launching with config:", {
    requestedAgents: payload.agentIds,
    availableAgents: agentConfigs.map((a) => a.id),
    agentConfigs: agentConfigs,
  });

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
    // Create the first terminal in the same folder
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

    const firstTerminal = await api.createTerminal({ cwd });
    if (!firstTerminal) {
      throw new Error("Failed to create first terminal");
    }

    // Create the initial tab with the first agent
    const { openTabFromExistingSession } = await import("@/store/actions/tab");
    const tabResult = await openTabFromExistingSession({
      sessionId: firstTerminal.sessionId,
      cwd,
      title: firstAgent.name,
    });
    if (!tabResult) {
      throw new Error("Failed to create tab");
    }

    const { tabId, paneId } = tabResult;
    let currentPaneId = paneId;

    // Send the interactive command for the first agent
    const firstInstances = payload.agentInstances?.[firstAgentId]
      ?.instances ?? [{ id: "1" }];
    const firstInstanceInstructions = firstInstances[0]?.instructions;
    const argumentText = firstInstanceInstructions
      ? `${payload.prompt}\n\n${firstInstanceInstructions}`
      : payload.prompt;
    const firstCommand = firstAgent.interactiveCommand.replace(
      "{arg}",
      `"${argumentText.replace(/"/g, '\\"')}"`,
    );

    setTimeout(() => {
      api.sendKeypress(firstTerminal.sessionId, firstCommand + "\r");
    }, 100);

    let instanceIndex = 1;

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

        // Get the split direction from layout plan
        const splitDirection = layoutPlan[splitIndex]?.direction ?? "row";
        splitIndex++;

        // Split the current pane and create a new terminal in the same folder
        const newPane = await splitPane(
          tabId,
          currentPaneId,
          splitDirection,
          false,
          {
            terminalOptions: { cwd },
          },
        );

        if (!newPane) {
          console.error(
            `Failed to split pane for ${agent.name} instance ${i + 1}`,
          );
          continue;
        }

        currentPaneId = newPane.id;

        // Send the interactive command with custom instructions
        const argumentText = instance.instructions
          ? `${payload.prompt}\n\n${instance.instructions}`
          : payload.prompt;
        const command = agent.interactiveCommand.replace(
          "{arg}",
          `"${argumentText.replace(/"/g, '\\"')}"`,
        );

        console.log(
          `[WorktreeLauncher] Agent ${agent.name} instance ${i + 1} command:`,
          {
            agentId,
            agentName: agent.name,
            template: agent.interactiveCommand,
            instructions: instance.instructions,
            finalCommand: command,
          },
        );

        setTimeout(
          () => {
            api.sendKeypress(newPane.sessionId, command + "\r");
          },
          100 * (instanceIndex + 1),
        );

        instanceIndex++;
      }
    }

    // Update notification
    updateNotification(notifId, {
      kind: "success",
      message: `Launched ${totalInstances} agent${totalInstances > 1 ? "s" : ""} in same folder`,
    });
  } catch (error) {
    updateNotification(notifId, {
      kind: "error",
      message: `Launch failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    throw error;
  }
}
