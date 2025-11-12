import { activeTabIdAtom, tabsAtom, workspaceNameAtom } from "@/store/atoms";
import type { Pane, Tab } from "@/types";
import type { Workspace } from "@shared/types";
import { getDefaultStore } from "jotai";
import { closeTab } from "./tab";

const api = window.conduit;
const store = getDefaultStore();

export async function openWorkspace(workspace: Workspace) {
  if (!workspace.tabs || workspace.tabs.length === 0) {
    return;
  }

  const workspaceTabs: Tab[] = [];
  for (const workspaceTab of workspace.tabs) {
    const panes: Record<string, Pane> = {};
    for (const sessionPane of workspaceTab.panes) {
      if (sessionPane.type === "terminal") {
        // Create a new terminal session with the saved cwd
        const result = await api.createTerminal(
          sessionPane.cwd ? { cwd: sessionPane.cwd } : undefined,
        );

        if (result) {
          panes[sessionPane.id] = {
            id: sessionPane.id,
            type: "terminal",
            sessionId: result.sessionId,
            cwd: result.cwd,
            processTitle: result.title,
            vmMetadata: result.vmMetadata ?? undefined,
          };

          // If a command was running, auto-run it
          if (sessionPane.command && sessionPane.command.trim().length > 0) {
            const commandWithNewline = sessionPane.command.endsWith("\n")
              ? sessionPane.command
              : `${sessionPane.command}\n`;
            api.sendKeypress(result.sessionId, commandWithNewline);
          }
        }
      } else if (sessionPane.type === "editor") {
        panes[sessionPane.id] = {
          id: sessionPane.id,
          type: "editor",
          cwd: sessionPane.cwd || "",
          filePath: sessionPane.filePath,
        };
      } else if (sessionPane.type === "webview") {
        panes[sessionPane.id] = {
          id: sessionPane.id,
          type: "webview",
          url: sessionPane.url || "about:blank",
          title: sessionPane.webTitle,
        };
      }
    }

    // Only create the tab if we successfully restored at least one pane
    if (Object.keys(panes).length > 0) {
      const tab: Tab = {
        ...workspaceTab,
        panes,
        locked: workspaceTab.locked ?? false,
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
