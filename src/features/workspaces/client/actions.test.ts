import type { Tab } from "@features/workbench/model";
import type { Workspace, WorkspaceState } from "../model";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { workspaceApi, terminalApi } = vi.hoisted(() => {
  const workspaceApi = {
    saveWorkspace: vi.fn<() => Promise<WorkspaceState>>(),
    setCurrentWorkspace:
      vi.fn<(name: string | null) => Promise<WorkspaceState>>(),
  };
  const terminalApi = {
    create: vi.fn(async () => ({
      sessionId: "session-1",
      title: "zsh",
      cwd: "/tmp",
    })),
    close: vi.fn(),
  };
  (window as any).conduit = { workspaces: workspaceApi, terminal: terminalApi };
  return { workspaceApi, terminalApi };
});

import { closeWorkspace, openWorkspace } from "./actions";
import { workspacesQuery } from "./queries";
import { queryClient } from "@/query";
import {
  activeTabAtom,
  activeTabIdAtom,
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
});

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
    expect(workspaceApi.setCurrentWorkspace).toHaveBeenCalledWith(null);
  });
});
