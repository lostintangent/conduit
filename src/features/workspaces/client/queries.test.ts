import type { Tab } from "@/types";
import type { WorkspaceState } from "@shared/types";
import { MutationObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const { workspaceApi } = vi.hoisted(() => {
  const workspaceApi = {
    renameWorkspace:
      vi.fn<(from: string, to: string) => Promise<WorkspaceState>>(),
    saveWorkspace: vi.fn<(name: string) => Promise<WorkspaceState>>(),
  };
  (globalThis as any).window.conduit = { workspaces: workspaceApi };
  return { workspaceApi };
});

import { workspaceMutations } from "@features/workspaces/client/queries";
import { createQueryClient } from "@/query";
import { activeTabIdAtom, tabsAtom, workspaceNameAtom } from "@/store/atoms";

const tab: Tab = {
  id: "tab-1",
  name: "Tab",
  panes: {},
  layout: { id: "node", type: "pane", paneId: "pane" },
  activePaneId: "pane",
};

describe("workspaceMutations", () => {
  it("saves the open workspace under its new name when the save waits on a rename", async () => {
    const client = createQueryClient();
    workspaceNameAtom.set("Old");
    tabsAtom.set([tab]);
    activeTabIdAtom.set("tab-1");
    let finishRename!: (state: WorkspaceState) => void;
    workspaceApi.renameWorkspace.mockReturnValue(
      new Promise((resolve) => (finishRename = resolve)),
    );
    workspaceApi.saveWorkspace.mockResolvedValue({ workspaces: [] });

    const renamed = new MutationObserver(
      client,
      workspaceMutations.rename(),
    ).mutate({ from: "Old", to: "New" });
    const saved = new MutationObserver(
      client,
      workspaceMutations.save(),
    ).mutate(undefined);
    await vi.waitFor(() =>
      expect(workspaceApi.renameWorkspace).toHaveBeenCalled(),
    );
    finishRename({ workspaces: [] });
    await Promise.all([renamed, saved]);

    expect(workspaceApi.saveWorkspace).toHaveBeenCalledTimes(1);
    expect(workspaceApi.saveWorkspace).toHaveBeenCalledWith(
      "New",
      [tab],
      "tab-1",
    );
    expect(workspaceNameAtom.get()).toBe("New");
  });
});
