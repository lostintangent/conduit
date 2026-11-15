import type { Tab } from "@features/workbench/model";
import type { Workspace, WorkspaceState } from "../model";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { workspaceApi, terminalApi, workbenchApi } = vi.hoisted(() => {
  const workspaceApi = {
    saveWorkspace: vi.fn<() => Promise<WorkspaceState>>(),
    setCurrentWorkspace:
      vi.fn<(name: string | null) => Promise<WorkspaceState>>(),
    recoverLastSession: vi.fn<() => Promise<string | undefined>>(),
    stagePages: vi.fn(async (_name: string | null): Promise<string[]> => []),
  };
  const terminalApi = {
    create: vi.fn(async () => ({
      sessionId: "session-1",
      title: "zsh",
      cwd: "/tmp",
    })),
    close: vi.fn(),
  };
  const workbenchApi = { reloadedAfterCrashLoop: vi.fn(async () => false) };
  (window as any).conduit = {
    workspaces: workspaceApi,
    terminal: terminalApi,
    workbench: workbenchApi,
  };
  return { workspaceApi, terminalApi, workbenchApi };
});

import { closeWorkspace, openWorkspace, restoreAtLaunch } from "./actions";
import { takePageRestore } from "@features/browser/client/webview";
import { workspacesQuery } from "./queries";
import { queryClient } from "@/query";
import {
  activeTabAtom,
  activeTabIdAtom,
  notificationsAtom,
  tabsAtom,
} from "@features/workbench/client/atoms";
import { enableMapSet } from "immer";

enableMapSet();

const editorTab = (id: string) => ({
  id,
  name: id,
  panes: [{ id: `${id}-pane`, type: "editor" as const, cwd: "/tmp" }],
  layout: { id: `${id}-node`, type: "pane" as const, paneId: `${id}-pane` },
  activePaneId: `${id}-pane`,
});

function seed(state: WorkspaceState) {
  queryClient.setQueryData(workspacesQuery.queryKey, state);
  workspaceApi.saveWorkspace.mockResolvedValue(state);
  workspaceApi.setCurrentWorkspace.mockImplementation(async (name) => ({
    ...state,
    current: name ?? undefined,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  tabsAtom.set([]);
  activeTabIdAtom.set(null);
  notificationsAtom.set([]);
});

const shellTab = (id: string) => ({
  ...editorTab(id),
  panes: [{ id: `${id}-pane`, type: "terminal" as const, cwd: "/tmp" }],
});

const tabIds = () => tabsAtom.get().map((tab) => tab.id);

describe("openWorkspace", () => {
  it("restores a saved workspace that is missing its active tab", async () => {
    // A stale id from the previous workspace must not survive the restore.
    activeTabIdAtom.set("tab-1");
    seed({
      workspaces: [
        {
          name: "Docs",
          tabs: [
            {
              id: "tab-1",
              name: "Docs",
              panes: [{ id: "a", type: "browser", url: "https://example.com" }],
              layout: { id: "node-a", type: "pane", paneId: "a" },
              activePaneId: "a",
            },
          ],
        } as unknown as Workspace,
      ],
    });

    await openWorkspace("Docs");

    expect(tabsAtom.get().map((tab) => tab.id)).toEqual(["tab-1"]);
    expect(activeTabAtom.get()).toBeNull();
    expect(workspaceApi.setCurrentWorkspace).toHaveBeenCalledWith("Docs");
  });

  it("reopens its pages with the history main set aside for them", async () => {
    const docs = {
      name: "Docs",
      lastModified: 0,
      tabs: [
        {
          id: "tab-1",
          panes: [
            { id: "a", type: "browser", url: "https://a.com" },
            { id: "b", type: "browser", url: "https://b.com" },
          ],
          layout: { id: "node-a", type: "pane", paneId: "a" },
          activePaneId: "a",
        },
      ],
    };
    seed({ workspaces: [docs] as unknown as Workspace[] });
    workspaceApi.stagePages.mockResolvedValueOnce(["a"]);

    await openWorkspace("Docs");

    expect(workspaceApi.stagePages).toHaveBeenCalledWith("Docs");
    expect(takePageRestore("a")).toBe(true);
    expect(takePageRestore("b")).toBe(false);
  });

  it("starts each restored terminal at the size it was saved at", async () => {
    seed({
      workspaces: [
        {
          name: "Work",
          lastModified: 0,
          activeTabId: "tab-1",
          tabs: [
            {
              id: "tab-1",
              name: "Shell",
              panes: [
                { id: "a", type: "terminal", cwd: "/tmp", cols: 132, rows: 41 },
              ],
              layout: { id: "node-a", type: "pane", paneId: "a" },
              activePaneId: "a",
            },
          ],
        },
      ],
    });

    await openWorkspace("Work");

    expect(terminalApi.create).toHaveBeenCalledWith({
      cwd: "/tmp",
      command: undefined,
      cols: 132,
      rows: 41,
    });
  });

  it("saves the tabs it replaces first, and leaves them open when it can't restore", async () => {
    tabsAtom.set([{ ...editorTab("mine"), panes: {} } as unknown as Tab]);
    seed({
      workspaces: [
        {
          name: "Work",
          lastModified: 0,
          tabs: [
            {
              ...editorTab("shell"),
              panes: [{ id: "shell-pane", type: "terminal", cwd: "/tmp" }],
            },
          ],
        },
      ],
    });
    terminalApi.create.mockRejectedValueOnce(new Error("no PTYs left"));

    await expect(openWorkspace("Work")).rejects.toThrow("no PTYs left");

    expect(workspaceApi.saveWorkspace).toHaveBeenCalledTimes(1);
    expect(tabsAtom.get().map((tab) => tab.id)).toEqual(["mine"]);
    expect(workspaceApi.setCurrentWorkspace).not.toHaveBeenCalled();
  });
});

describe("closeWorkspace", () => {
  it("goes back to the anonymous workspace's tabs", async () => {
    tabsAtom.set([{ ...editorTab("work"), panes: {} } as unknown as Tab]);
    seed({
      workspaces: [{ name: "Work", lastModified: 0, tabs: [] }],
      untitled: { lastModified: 0, tabs: [editorTab("mine")] as never },
      current: "Work",
    });

    await closeWorkspace();

    expect(tabsAtom.get().map((tab) => tab.id)).toEqual(["mine"]);
    expect(workspaceApi.stagePages).toHaveBeenCalledWith(null);
    expect(workspaceApi.setCurrentWorkspace).toHaveBeenCalledWith(null);
  });
});

describe("restoreAtLaunch", () => {
  const work = {
    name: "Work",
    lastModified: 0,
    activeTabId: "work",
    tabs: [editorTab("work")],
  };
  const untitled = { lastModified: 0, tabs: [editorTab("mine")] };

  it("reopens the named workspace that was open", async () => {
    seed({ workspaces: [work], untitled, current: "Work" });

    await restoreAtLaunch();

    expect(tabIds()).toEqual(["work"]);
    expect(activeTabIdAtom.get()).toBe("work");
    expect(workspaceApi.stagePages).toHaveBeenCalledWith("Work");
    expect(workspaceApi.setCurrentWorkspace).not.toHaveBeenCalled();
    expect(workspaceApi.saveWorkspace).not.toHaveBeenCalled();
  });

  it("reopens the window's unnamed tabs when no named workspace was open", async () => {
    seed({ workspaces: [work], untitled });

    await restoreAtLaunch();

    expect(tabIds()).toEqual(["mine"]);
    expect(workspaceApi.stagePages).toHaveBeenCalledWith(null);
  });

  it("opens a new tab when there's nothing to reopen", async () => {
    seed({ workspaces: [work] });

    await restoreAtLaunch();

    expect(tabsAtom.get()).toHaveLength(1);
    expect(tabsAtom.get()[0].panes).toMatchObject({
      [tabsAtom.get()[0].activePaneId!]: { sessionId: "session-1" },
    });
  });

  it("closes the shells it started, and says where it kept the tabs, when one can't start", async () => {
    terminalApi.create
      .mockResolvedValueOnce({ sessionId: "started", title: "zsh", cwd: "/" })
      .mockRejectedValueOnce(new Error("posix_spawnp failed"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    workspaceApi.recoverLastSession.mockResolvedValueOnce(
      "Recovered Nov 15, 1:25 PM",
    );
    seed({
      workspaces: [work],
      untitled: { lastModified: 0, tabs: [shellTab("one"), shellTab("two")] },
    });

    await restoreAtLaunch();

    expect(terminalApi.close).toHaveBeenCalledWith("started");
    expect(tabsAtom.get()).toHaveLength(1);
    expect(tabIds()).not.toContain("one");
    // Or the new tab would save over them.
    expect(workspaceApi.recoverLastSession).toHaveBeenCalledOnce();
    expect(notificationsAtom.get()).toMatchObject([
      {
        kind: "error",
        message: "Couldn't reopen your last session",
        details:
          "Your tabs are saved as “Recovered Nov 15, 1:25 PM”.\nposix_spawnp failed",
      },
    ]);
  });

  it("keeps the last session aside and opens a new tab after the page crashed again soon after reloading", async () => {
    workbenchApi.reloadedAfterCrashLoop.mockResolvedValueOnce(true);
    seed({ workspaces: [work], untitled, current: "Work" });

    await restoreAtLaunch();

    expect(tabsAtom.get()).toHaveLength(1);
    expect(tabIds()).not.toContain("work");
    expect(workspaceApi.recoverLastSession).toHaveBeenCalledOnce();
    // The crash dialog already said why
    expect(notificationsAtom.get()).toEqual([]);
  });
});
