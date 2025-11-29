import { activeTabIdAtom, tabsAtom, workspaceNameAtom } from "@/store/atoms";
import type { Pane, Tab } from "@/types";
import type { TerminalCreateResponse, Workspace } from "@shared/types";
import { getDefaultStore } from "jotai";
import { closeTab } from "./tab";

const api = window.conduit;
const store = getDefaultStore();

export async function openWorkspace(workspace: Workspace) {
  if (!workspace.tabs || workspace.tabs.length === 0) {
    return;
  }

  // Track mapping of old sessionIds to new terminal sessions.
  // This allows cloned panes (which share the same sessionId) to be
  // properly restored with a shared new terminal session.
  const sessionMapping = new Map<string, TerminalCreateResponse>();

  const workspaceTabs: Tab[] = [];
  for (const workspaceTab of workspace.tabs) {
    const panes: Record<string, Pane> = {};
    for (const pane of workspaceTab.panes) {
      if (pane.type === "terminal") {
        const oldSessionId = pane.sessionId;

        // Check if we've already created a terminal for this session
        // (happens when restoring cloned panes that shared the same sessionId)
        let result: TerminalCreateResponse;
        const existingSession = oldSessionId
          ? sessionMapping.get(oldSessionId)
          : undefined;

        if (existingSession) {
          // Reuse the existing terminal session for cloned panes
          result = existingSession;
        } else {
          // Create a new terminal session
          result = await api.createTerminal(
            pane.cwd ? { cwd: pane.cwd } : undefined,
          );

          // Track the mapping if the pane had a sessionId
          if (oldSessionId) {
            sessionMapping.set(oldSessionId, result);
          }

          // If a command was running, auto-run it (only for the first pane in a clone group)
          if (pane.command?.trim().length > 0) {
            const commandWithNewline = pane.command.endsWith("\n")
              ? pane.command
              : `${pane.command}\n`;
            api.sendKeypress(result.sessionId, commandWithNewline);
          }
        }

        panes[pane.id] = {
          id: pane.id,
          type: "terminal" as const,
          sessionId: result.sessionId,
          cwd: result.cwd ?? pane.cwd ?? null,
          processTitle: result.title,
          vmMetadata: result.vmMetadata,
        };
      } else {
        // For non-terminal panes, just restore as-is
        panes[pane.id] = {
          ...(pane as Pane),
        };
      }
    }

    // Only create the tab if we successfully restored at least one pane
    if (Object.keys(panes).length > 0) {
      const tab: Tab = {
        ...workspaceTab,
        panes,
      };

      workspaceTabs.push(tab);
    }
  }

  if (workspaceTabs.length > 0) {
    store.set(tabsAtom, workspaceTabs);
    store.set(activeTabIdAtom, workspace.activeTabId);
    store.set(workspaceNameAtom, workspace.name);
  }
}

export async function closeWorkspace() {
  store.set(workspaceNameAtom, null);
  store.get(tabsAtom).forEach((tab) => closeTab(tab.id, { force: true }));
}
