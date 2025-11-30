import { activeTabIdAtom, tabsAtom, workspaceNameAtom } from "@/store/atoms";
import type { Pane, Tab } from "@/types";
import type { Workspace } from "@shared/types";
import { getDefaultStore } from "jotai";
import { closeTab } from "./tab";

const api = window.conduit;
const store = getDefaultStore();

export async function openWorkspace(workspace: Workspace) {
  await closeWorkspace({ openReplacement: false });

  if (!workspace.tabs || workspace.tabs.length === 0) {
    return;
  }

  const workspaceTabs: Tab[] = [];
  for (const workspaceTab of workspace.tabs) {
    const panes: Record<string, Pane> = {};
    for (const pane of workspaceTab.panes) {
      if (pane.type === "terminal") {
        const result = await api.createTerminal(
          pane.cwd ? { cwd: pane.cwd } : undefined,
        );

        panes[pane.id] = {
          ...(pane as Pane),
          ...result,
        };

        // If a command was running, auto-run it
        if (pane.command?.trim().length > 0) {
          const commandWithNewline = pane.command.endsWith("\n")
            ? pane.command
            : `${pane.command}\n`;
          api.sendKeypress(result.sessionId, commandWithNewline);
        }
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

type CloseWorkspaceOptions = {
  openReplacement?: boolean;
};

export async function closeWorkspace(options: CloseWorkspaceOptions = {}) {
  const { openReplacement = true } = options;

  store.set(workspaceNameAtom, null);
  store
    .get(tabsAtom)
    .forEach((tab) => closeTab(tab.id, { force: true, openReplacement }));
}
