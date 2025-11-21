/**
 * Multi-Launch Actions
 *
 * Core orchestration for multi-launch mode, handling agent session spawning
 * and parallel pane creation.
 */

import { enqueueNotification } from "@/store/actions/notifications";
import { splitPane } from "@/store/actions/pane";
import { tabsAtom } from "@/store/atoms";
import { calculateMultiLaunchLayout } from "@/utils/multiLaunchLayout";
import type { AgentConfig, AgentSessionInfo } from "@shared/types";
import { getDefaultStore } from "jotai";

const api = window.conduit;
const store = getDefaultStore();

type MultiLaunchResult = {
  success: boolean;
  launchedCount: number;
  errors: string[];
};

/**
 * Execute multi-launch: create multiple agent sessions and panes
 *
 * @param sourceTabId Tab containing the source pane
 * @param sourcePaneId Pane to use as anchor for splits
 * @param prompt User prompt to pass to all agents
 * @param agents Array of enabled agents to launch
 * @param createWorktrees Whether to create isolated git worktrees for each agent
 * @returns Result with success status and any errors
 */
export async function executeMultiLaunch(
  sourceTabId: string,
  sourcePaneId: string,
  prompt: string,
  agents: AgentConfig[],
  createWorktrees = true,
): Promise<MultiLaunchResult> {
  const result: MultiLaunchResult = {
    success: false,
    launchedCount: 0,
    errors: [],
  };

  if (agents.length === 0) {
    result.errors.push("No agents enabled for multi-launch");
    return result;
  }

  // Get source pane context
  const tabs = store.get(tabsAtom);
  const sourceTab = tabs.find((t) => t.id === sourceTabId);
  if (!sourceTab) {
    result.errors.push("Source tab not found");
    return result;
  }

  const sourcePane = sourceTab.panes[sourcePaneId];
  if (!sourcePane) {
    result.errors.push("Source pane not found");
    return result;
  }

  const cwd = sourcePane.type === "terminal" ? sourcePane.cwd : null;
  if (!cwd) {
    result.errors.push("Cannot determine working directory");
    return result;
  }

  // Calculate layout strategy
  const layoutSteps = calculateMultiLaunchLayout(agents.length);

  // Create agent sessions (or use same cwd for all)
  const sessions: Array<{
    agent: AgentConfig;
    session: AgentSessionInfo | null;
    cwd: string;
  }> = [];

  if (createWorktrees) {
    enqueueNotification({
      kind: "info",
      message: `Creating ${agents.length} agent sessions...`,
      autoCloseMs: 2000,
    });

    for (const agent of agents) {
      try {
        const session = await api.spawnAgentSession({ cwd });
        if (!session) {
          result.errors.push(`Failed to create session for ${agent.name}`);
          continue;
        }
        sessions.push({ agent, session, cwd: session.worktreePath });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        result.errors.push(`${agent.name}: ${errorMessage}`);
      }
    }
  } else {
    // No worktrees - all agents use the same directory
    for (const agent of agents) {
      sessions.push({ agent, session: null, cwd });
    }
  }

  if (sessions.length === 0) {
    enqueueNotification({
      kind: "error",
      message: "Failed to create any agent sessions",
      details: result.errors.join("\n"),
      autoCloseMs: null,
    });
    return result;
  }

  // Create panes and execute commands
  let currentPaneId = sourcePaneId;
  const createdPaneIds: string[] = [];

  for (let i = 0; i < sessions.length; i++) {
    const { agent, session, cwd: agentCwd } = sessions[i];
    const layoutStep = layoutSteps[i];

    try {
      // Create the new pane
      await splitPane(
        sourceTabId,
        currentPaneId,
        layoutStep.direction,
        layoutStep.insertBefore,
        {
          terminalOptions: { cwd: agentCwd },
          agentSession: session ?? undefined,
        },
      );

      // Get the newly created pane ID
      const updatedTabs = store.get(tabsAtom);
      const updatedTab = updatedTabs.find((t) => t.id === sourceTabId);
      if (!updatedTab) {
        throw new Error("Tab disappeared after split");
      }

      // Find the new pane (it should be the last one added)
      const paneIds = Object.keys(updatedTab.panes);
      const newPaneId = paneIds.find(
        (id) => !createdPaneIds.includes(id) && id !== sourcePaneId,
      );

      if (!newPaneId) {
        throw new Error("Could not find newly created pane");
      }

      createdPaneIds.push(newPaneId);
      const newPane = updatedTab.panes[newPaneId];

      // Execute launch command if available
      if (agent.launchCommand && newPane.type === "terminal") {
        // Replace {arg} placeholder with quoted prompt
        const command = agent.launchCommand.replace(
          "{arg}",
          `"${prompt.replace(/"/g, '\\"')}"`,
        );

        // Send command to terminal using sendKeypress
        await api.sendKeypress(newPane.sessionId, command + "\n");
        result.launchedCount++;
      }

      // Use the new pane as anchor for the next split
      currentPaneId = newPaneId;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      result.errors.push(`${agent.name}: ${errorMessage}`);
    }
  }

  // Show result notification
  if (result.launchedCount > 0) {
    result.success = true;
    enqueueNotification({
      kind: "success",
      message: `Launched ${result.launchedCount} agent${result.launchedCount > 1 ? "s" : ""}`,
      details:
        result.errors.length > 0
          ? `${result.errors.length} error(s): ${result.errors.join(", ")}`
          : undefined,
      autoCloseMs: 4000,
    });
  } else {
    enqueueNotification({
      kind: "error",
      message: "Multi-launch failed",
      details: result.errors.join("\n"),
      autoCloseMs: null,
    });
  }

  return result;
}

/**
 * Get enabled agents for multi-launch from settings
 *
 * @param agents All configured agents
 * @returns Agents that are enabled for multi-launch and have launch commands
 */
export function getEnabledMultiLaunchAgents(
  agents: AgentConfig[],
): AgentConfig[] {
  return agents.filter(
    (agent) => agent.enabledForMultiLaunch && agent.launchCommand,
  );
}
