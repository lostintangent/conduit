import { activeTabIdAtom, tabsAtom } from "@features/workbench/client/atoms";
import type { LayoutNode, Pane, Tab } from "@features/workbench/model";
import type { TerminalPane as SharedTerminalPane } from "@shared/types/panes";
import type { Workspace } from "../model";
import { enqueueNotification } from "@features/workbench/client/actions/notifications";
import { closeTab, openTab } from "@features/workbench/client/actions/tab";
import { queryClient, runMutation } from "@/query";
import { switching } from "./autosave";
import { workspaceMutations, workspacesQuery } from "./queries";

const api = window.conduit;

type WorkspacePane = Workspace["tabs"][number]["panes"][number];
type WorkspaceTerminalPane = WorkspacePane & SharedTerminalPane;

/**
 * Reopens what was open when Conduit last quit: the named workspace, or else
 * the window's unnamed tabs. When that can't open, or the page keeps crashing,
 * the window starts outside any named workspace, so its new tab can't save
 * over one.
 */
export async function restoreAtLaunch() {
  try {
    const state = await queryClient.ensureQueryData(workspacesQuery);
    const last =
      state.workspaces.find((saved) => saved.name === state.current) ??
      state.untitled;
    if (last?.tabs.length) {
      if (await api.workbench.reloadedAfterCrashLoop()) {
        await leaveNamedWorkspace();
      } else {
        await restoreTabs(last);
      }
    }
  } catch (error) {
    console.error("[Workspaces] Couldn't reopen the last session:", error);
    enqueueNotification({
      kind: "error",
      message: "Couldn't reopen your last session",
      details: (error as Error).message,
    });
    await leaveNamedWorkspace();
  }
  if (tabsAtom.get().length === 0) await openTab();
}

async function leaveNamedWorkspace() {
  // Its own error toast is enough.
  await runMutation(workspaceMutations.setCurrent(), null).catch(() => {});
}

/**
 * Opens a saved workspace in place of the window's tabs, once they've saved
 * into the workspace that was open.
 */
export function openWorkspace(name: string) {
  return switching(async () => {
    const state = await queryClient.ensureQueryData(workspacesQuery);
    if (state.current === name) return;
    const workspace = state.workspaces.find((saved) => saved.name === name);
    if (!workspace) throw new Error(`Workspace "${name}" not found`);

    // Marked open only once its tabs are, so a restore that fails can't
    // leave the window's tabs saving into it
    await restoreTabs(workspace);
    await runMutation(workspaceMutations.setCurrent(), name);
  });
}

/**
 * Goes back to the anonymous workspace, with the tabs it had when a named
 * one opened over it.
 */
export function closeWorkspace() {
  return switching(async () => {
    const state = await queryClient.ensureQueryData(workspacesQuery);
    if (!state.current) return;

    await restoreTabs(state.untitled ?? { tabs: [] });
    await runMutation(workspaceMutations.setCurrent(), null);
  });
}

/** Saves the window's tabs under a name, and opens that workspace. */
export function saveWorkspaceAs(name: string) {
  return switching(async () => {
    await runMutation(workspaceMutations.saveAs(), name);
  });
}

/**
 * Replaces the window's tabs with a workspace's, starting its terminals. A
 * workspace without tabs gets a new one. If a terminal can't start, the ones
 * that did are closed and the window's tabs stay as they were.
 */
async function restoreTabs(workspace: Pick<Workspace, "tabs" | "activeTabId">) {
  // Shared across all tabs to support cross-tab terminal cloning
  const terminalSessions = new Map<
    string,
    Awaited<ReturnType<typeof api.terminal.create>>
  >();

  let workspaceTabs: Tab[];
  try {
    workspaceTabs = await startTabs(workspace.tabs, terminalSessions);
  } catch (error) {
    await Promise.allSettled(
      Array.from(terminalSessions.values(), ({ sessionId }) =>
        api.terminal.close(sessionId),
      ),
    );
    throw error;
  }

  closeAllTabs();

  tabsAtom.set(workspaceTabs);
  // Workspace files can be edited by hand, so a field may be missing.
  activeTabIdAtom.set(workspace.activeTabId ?? null);
  if (workspaceTabs.length === 0) await openTab();
}

async function startTabs(
  tabs: Workspace["tabs"],
  terminalSessions: Map<
    string,
    Awaited<ReturnType<typeof api.terminal.create>>
  >,
) {
  const workspaceTabs: Tab[] = [];
  for (const workspaceTab of tabs) {
    const panes: Record<string, Pane> = {};
    const restoreTerminalPane = async (pane: WorkspaceTerminalPane) => {
      const cloneSourceId = pane.cloneOf ?? pane.id;
      let session = terminalSessions.get(cloneSourceId);

      if (!session) {
        const command =
          !pane.cloneOf && pane.command ? pane.command : undefined;

        session = await api.terminal.create({
          cwd: pane.cwd ?? undefined,
          command,
          cols: pane.cols,
          rows: pane.rows,
        });
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
  return workspaceTabs;
}

function closeAllTabs() {
  tabsAtom
    .get()
    .forEach((tab) =>
      closeTab(tab.id, { force: true, openReplacement: false }),
    );
}
