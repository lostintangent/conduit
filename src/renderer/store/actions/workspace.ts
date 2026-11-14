import { pauseStateTracking } from "@/components/panes/terminal/state/stateTracker";
import { activeTabIdAtom, tabsAtom, workspaceNameAtom } from "@/store/atoms";
import type { LayoutNode, Pane, Tab, TerminalPane } from "@/types";
import { walkLayout } from "@/utils/layout";
import type {
  TerminalPane as SharedTerminalPane,
  Workspace,
} from "@shared/types";
import { closeTab } from "./tab";

const api = window.conduit;

type WorkspacePane = Workspace["tabs"][number]["panes"][number];
type WorkspaceTerminalPane = WorkspacePane & SharedTerminalPane;

export async function openWorkspace(workspace: Workspace) {
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
        const command =
          !pane.cloneOf && pane.command ? pane.command : undefined;

        session = await api.createTerminal({
          cwd: pane.cwd ?? undefined,
          command,
          cols: pane.cols,
          rows: pane.rows,
        });

        if (!session) {
          return;
        }

        terminalSessions.set(cloneSourceId, session);
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

    const tab: Tab = {
      ...workspaceTab,
      panes,
      layout: workspaceTab.layout as LayoutNode,
    };

    workspaceTabs.push(tab);
  }

  await closeWorkspace({ openReplacement: false });

  tabsAtom.set(workspaceTabs);
  // Workspace files can be edited by hand, so a field may be missing.
  activeTabIdAtom.set(workspace.activeTabId ?? null);
  workspaceNameAtom.set(workspace.name ?? null);

  // Pause idle tracking for any collapsed terminal panes
  for (const tab of workspaceTabs) {
    walkLayout(tab.layout, ({ node }) => {
      if (node.type === "pane" && node.collapsed) {
        const pane = tab.panes[node.paneId];
        if (pane?.type === "terminal") {
          pauseStateTracking((pane as TerminalPane).sessionId);
        }
      }
      return true;
    });
  }
}

type CloseWorkspaceOptions = {
  openReplacement?: boolean;
};

export async function closeWorkspace(options: CloseWorkspaceOptions = {}) {
  const { openReplacement = true } = options;

  workspaceNameAtom.set(null);
  tabsAtom
    .get()
    .forEach((tab) => closeTab(tab.id, { force: true, openReplacement }));
}
