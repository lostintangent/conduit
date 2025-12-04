import { activeTabIdAtom, tabsAtom, workspaceNameAtom } from "@/store/atoms";
import type { LayoutNode, Pane, Tab } from "@/types";
import type {
  TerminalPane as SharedTerminalPane,
  Workspace,
} from "@shared/types";
import { getDefaultStore } from "jotai";
import { closeTab } from "./tab";

const api = window.conduit;
const store = getDefaultStore();

type WorkspacePane = Workspace["tabs"][number]["panes"][number];
type WorkspaceTerminalPane = WorkspacePane & SharedTerminalPane;

export async function openWorkspace(workspace: Workspace) {
  await closeWorkspace({ openReplacement: false });

  if (!workspace.tabs || workspace.tabs.length === 0) {
    return;
  }

  // Shared across all tabs to support cross-tab terminal cloning
  const terminalSessions = new Map<
    string,
    Awaited<ReturnType<typeof api.createTerminal>>
  >();

  const workspaceTabs: Tab[] = [];
  for (const workspaceTab of workspace.tabs) {
    const panes: Record<string, Pane> = {};
    const restoreTerminalPane = async (pane: WorkspaceTerminalPane) => {
      const cloneSourceId = pane.cloneOf ?? pane.id;
      let session = terminalSessions.get(cloneSourceId);

      if (!session) {
        session = await api.createTerminal(
          pane.cwd ? { cwd: pane.cwd } : undefined,
        );

        if (!session) {
          return;
        }

        terminalSessions.set(cloneSourceId, session);

        if (!pane.cloneOf && pane.command?.trim().length) {
          const commandWithNewline = pane.command.endsWith("\n")
            ? pane.command
            : `${pane.command}\n`;
          api.sendKeypress(session.sessionId, commandWithNewline);
        }
      }

      panes[pane.id] = {
        ...(pane as Pane),
        ...session,
      };
    };

    for (const pane of workspaceTab.panes) {
      if (pane.type !== "terminal") {
        panes[pane.id] = {
          ...(pane as Pane),
        };
      }
    }

    const terminalPanes = workspaceTab.panes.filter(
      (pane): pane is WorkspaceTerminalPane => pane.type === "terminal",
    );

    const normalTerminals = terminalPanes.filter((pane) => !pane.cloneOf);
    const clonedTerminals = terminalPanes.filter((pane) => !!pane.cloneOf);

    for (const pane of normalTerminals) {
      await restoreTerminalPane(pane);
    }

    for (const pane of clonedTerminals) {
      await restoreTerminalPane(pane);
    }

    // Only create the tab if we successfully restored at least one pane
    if (Object.keys(panes).length > 0) {
      const tab: Tab = {
        ...workspaceTab,
        panes,
        layout: workspaceTab.layout as LayoutNode,
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
