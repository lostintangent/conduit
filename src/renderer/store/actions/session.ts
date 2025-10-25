import { activeTabIdAtom, tabsAtom } from "@/store/atoms";
import type { LayoutNode, Pane, Tab } from "@/types";
import type { Workspace } from "@shared/types";
import { getDefaultStore } from "jotai";

const store = getDefaultStore();

export async function restoreSession(sessionData: Workspace): Promise<void> {
  const api = window.conduit;
  if (!api) {
    return;
  }

  if (!sessionData.tabs || sessionData.tabs.length === 0) {
    return;
  }

  const restoredTabs: Tab[] = [];

  for (const sessionTab of sessionData.tabs) {
    const panes: Record<string, Pane> = {};

    // Restore panes
    for (const sessionPane of sessionTab.panes) {
      if (sessionPane.type === "terminal") {
        // Create a new terminal session with the saved cwd
        const result = await api.createTerminal(
          sessionPane.cwd ? { cwd: sessionPane.cwd } : undefined
        );

        if (result) {
          panes[sessionPane.id] = {
            id: sessionPane.id,
            type: "terminal",
            sessionId: result.sessionId,
            cwd: result.cwd,
            processTitle: result.title,
          };

          // If a command was running, auto-run it
          if (sessionPane.command && sessionPane.command.trim().length > 0) {
            const commandWithNewline = sessionPane.command.endsWith("\n")
              ? sessionPane.command
              : `${sessionPane.command}\n`;
            api.sendKeypress(result.sessionId, commandWithNewline);
          }
        }
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
        id: sessionTab.id,
        title: sessionTab.title,
        panes,
        layout: sessionTab.layout as LayoutNode,
        mode: sessionTab.mode,
        activePaneId: sessionTab.activePaneId,
      };

      restoredTabs.push(tab);
    }
  }

  if (restoredTabs.length > 0) {
    // Clear existing tabs and replace with restored ones
    store.set(tabsAtom, restoredTabs);
    store.set(activeTabIdAtom, sessionData.activeTabId);
  }
}
