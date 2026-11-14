/**
 * Agent commands: launching agents, splitting panes into agent sessions, and
 * merging, terminating or deleting their worktrees
 */

import { When } from "@/commands";
import {
  activePaneType,
  hasActivePane,
  hasGitRepo,
  isInAgentSession,
  paneActionsEnabled,
  tabHasWorktrees,
} from "@/commands/contextKeys/appContextKeys";
import type { CommandDescriptor } from "@/commands/core/types";
import { MenuId } from "@/commands/menus/types";
import {
  handleManageSessions,
  handleMergeAndClose,
  handleTerminate,
} from "@features/agents/client/agentHandlers";
import { enqueueNotification } from "@features/workbench/client/actions/notifications";
import {
  closeAgentSessionPanes,
  splitPaneWithAgentSession,
} from "@features/workbench/client/actions/pane";
import type { Tab } from "@features/workbench/model";
import { ApplicationCommands } from "@shared/commands";

export default [
  // Pane: Split Left with Agent Session
  {
    id: ApplicationCommands.PANE_SPLIT_LEFT_AGENT,
    title: "Split Pane Left (Agent Session)",
    description: "Create a new pane to the left with an isolated agent session",
    category: "Pane",
    keybinding: { key: "Cmd+Shift+Ctrl+Left" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/1_split_agent_session",
      order: 1,
      when: hasGitRepo.isTrue(),
      title: "Left",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        void splitPaneWithAgentSession(targetTabId, targetPaneId, "row", true);
      }
    },
  },

  // Pane: Split Right with Agent Session
  {
    id: ApplicationCommands.PANE_SPLIT_RIGHT_AGENT,
    title: "Split Pane Right (Agent Session)",
    description:
      "Create a new pane to the right with an isolated agent session",
    category: "Pane",
    keybinding: { key: "Cmd+Shift+Ctrl+Right" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/1_split_agent_session",
      order: 2,
      when: hasGitRepo.isTrue(),
      title: "Right",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        void splitPaneWithAgentSession(targetTabId, targetPaneId, "row");
      }
    },
  },

  // Pane: Split Top with Agent Session
  {
    id: ApplicationCommands.PANE_SPLIT_TOP_AGENT,
    title: "Split Pane Top (Agent Session)",
    description: "Create a new pane above with an isolated agent session",
    category: "Pane",
    keybinding: { key: "Cmd+Shift+Ctrl+Up" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/1_split_agent_session",
      order: 3,
      when: hasGitRepo.isTrue(),
      title: "Top",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        void splitPaneWithAgentSession(
          targetTabId,
          targetPaneId,
          "column",
          true,
        );
      }
    },
  },

  // Pane: Split Bottom with Agent Session
  {
    id: ApplicationCommands.PANE_SPLIT_BOTTOM_AGENT,
    title: "Split Pane Bottom (Agent Session)",
    description: "Create a new pane below with an isolated agent session",
    category: "Pane",
    keybinding: { key: "Cmd+Shift+Ctrl+Down" },
    when: paneActionsEnabled,
    menu: {
      id: MenuId.PaneContext,
      group: "3_split_more/1_split_agent_session",
      order: 4,
      when: hasGitRepo.isTrue(),
      title: "Bottom",
    },
    run: (context, tabId?: string, paneId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      const targetPaneId = paneId ?? context.activePaneId;
      if (targetTabId && targetPaneId) {
        void splitPaneWithAgentSession(targetTabId, targetPaneId, "column");
      }
    },
  },

  // Agent: Launch
  {
    id: ApplicationCommands.AGENT_LAUNCH,
    title: "Launch Agents",
    description:
      "Open agent launcher to split panes or worktrees and start agents with a prompt",
    category: "Agent",
    keybinding: { key: "Cmd+I" },
    when: When.and(hasActivePane.isTrue(), activePaneType.equals("terminal")),
    run: (context) => {
      if (context.setShowAgentLauncher) {
        context.setShowAgentLauncher(true);
      }
    },
  },

  // Agent: Manage Sessions
  {
    id: ApplicationCommands.AGENT_MANAGE_SESSIONS,
    title: "Manage Agent Sessions",
    description: "Remove one or all agent worktrees without merging",
    category: "Agent",
    run: (context) => {
      void handleManageSessions(context);
    },
  },

  // Agent: Merge and Close
  {
    id: ApplicationCommands.AGENT_MERGE_AND_CLOSE,
    title: "Merge and Close Agent Session",
    description: "Commit, merge, and close the isolated agent worktree",
    category: "Agent",
    when: isInAgentSession.isTrue(),
    run: (context) => {
      void handleMergeAndClose(context.activeTab);
    },
  },

  // Agent: Terminate
  {
    id: ApplicationCommands.AGENT_TERMINATE,
    title: "Terminate Agent Session",
    description: "Remove the isolated worktree without merging",
    category: "Agent",
    when: isInAgentSession.isTrue(),
    run: (context) => {
      void handleTerminate(context.activeTab);
    },
  },

  // Agent: Delete All Worktrees
  {
    id: ApplicationCommands.AGENT_DELETE_ALL_WORKTREES,
    title: "Delete All Worktrees",
    description: "Delete all agent worktrees associated with this tab",
    category: "Agent",
    when: tabHasWorktrees.isTrue(),
    menu: {
      id: MenuId.TabContext,
      group: "4_tab",
      order: 0,
    },
    run: async (context, tabId?: string) => {
      const targetTabId = tabId ?? context.activeTab?.id;
      if (!targetTabId) {
        return;
      }

      const tab: Tab | undefined = context.allTabs.find(
        (t) => t.id === targetTabId,
      );
      if (!tab) {
        return;
      }

      // Collect all unique agent session IDs from panes with worktrees
      const agentSessionIds = new Set<string>();
      for (const pane of Object.values(tab.panes)) {
        if (
          (pane.type === "terminal" || pane.type === "editor") &&
          pane.agentSessionId &&
          pane.agentWorktreePath
        ) {
          agentSessionIds.add(pane.agentSessionId);
        }
      }

      if (agentSessionIds.size === 0) {
        return;
      }

      // Show progress notification
      const _notifId = enqueueNotification({
        kind: "info",
        message: `Deleting ${agentSessionIds.size} worktree${agentSessionIds.size > 1 ? "s" : ""}...`,
      });

      let successCount = 0;
      let errorCount = 0;

      // Delete each agent session
      for (const sessionId of agentSessionIds) {
        try {
          // Resolves as "removed" or "missing" (already gone), throws on failure
          await window.conduit.agents.cleanupSession(sessionId);
          successCount++;
        } catch (error) {
          console.error(`Failed to delete agent session ${sessionId}:`, error);
          errorCount++;
        }
      }

      // Close all panes associated with deleted sessions
      for (const sessionId of agentSessionIds) {
        closeAgentSessionPanes(targetTabId, sessionId);
      }

      // Update notification with result
      if (errorCount === 0) {
        enqueueNotification({
          kind: "success",
          message: `Successfully deleted ${successCount} worktree${successCount > 1 ? "s" : ""}`,
          autoCloseMs: 3000,
        });
      } else {
        enqueueNotification({
          kind: "error",
          message: `Deleted ${successCount} worktree${successCount > 1 ? "s" : ""}, ${errorCount} failed`,
          autoCloseMs: 5000,
        });
      }
    },
  },
] satisfies CommandDescriptor[];
