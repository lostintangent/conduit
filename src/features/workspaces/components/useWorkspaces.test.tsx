import type { Workspace, WorkspaceState } from "@shared/types";
import { act, waitFor } from "@testing-library/react";
import {
  renderHook,
  seedSettings,
} from "../../../../tests/renderer/queryRender";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getState, saveWorkspace } = vi.hoisted(() => {
  const getState = vi.fn<() => Promise<WorkspaceState>>();
  const saveWorkspace =
    vi.fn<
      (
        name: string,
        tabs: unknown,
        activeTabId?: string,
      ) => Promise<WorkspaceState>
    >();
  (globalThis as any).window.conduit = {
    workspaces: { getState, saveWorkspace },
    onOpenWorkspaceRequest: () => () => {},
  };
  return { getState, saveWorkspace };
});

import { useWorkspaces } from "@features/workspaces/components/useWorkspaces";
import { createQueryClient } from "@/query";
import {
  activeTabIdAtom,
  previousTabsSnapshotAtom,
  tabsAtom,
  workspaceHasChangesAtom,
  workspaceNameAtom,
} from "@/store/atoms";
import type { Tab } from "@/types";

const lastWorkspace: Workspace = {
  name: "__last_workspace__",
  lastModified: 1,
  tabs: [],
  activeTabId: "",
};

describe("useWorkspaces", () => {
  it.each<[WorkspaceState, boolean]>([
    [{ workspaces: [], lastWorkspace }, true],
    [{ workspaces: [] }, false],
  ])(
    "reports whether a last workspace exists (%#)",
    async (state, expected) => {
      getState.mockResolvedValue(state);

      const { result } = renderHook(() => useWorkspaces());

      await waitFor(() => expect(getState).toHaveBeenCalled());
      await waitFor(() =>
        expect(result.current.hasLastWorkspace).toBe(expected),
      );
    },
  );
});

describe("useWorkspaces change tracking", () => {
  function tab(id: string): Tab {
    return {
      id,
      panes: {
        [`${id}-pane`]: {
          id: `${id}-pane`,
          type: "terminal",
          sessionId: `${id}-session`,
          cwd: "/repo",
        },
      },
      layout: { id: `${id}-node`, type: "pane", paneId: `${id}-pane` },
      activePaneId: `${id}-pane`,
    };
  }

  function renderWorkspaces(autoSaveWorkspaces: boolean) {
    return renderHook(() => useWorkspaces(), {
      queryClient: seedSettings(createQueryClient(), { autoSaveWorkspaces }),
    });
  }

  beforeEach(() => {
    getState.mockResolvedValue({ workspaces: [] });
    saveWorkspace.mockReset();
    saveWorkspace.mockResolvedValue({ workspaces: [] });
    tabsAtom.set([tab("one")]);
    activeTabIdAtom.set("one");
    workspaceNameAtom.set(null);
    previousTabsSnapshotAtom.set("");
    workspaceHasChangesAtom.set(false);
  });

  /** Opens a workspace the way openWorkspace does, into a running window */
  function open(name: string, tabs: Tab[]) {
    act(() => {
      tabsAtom.set(tabs);
      activeTabIdAtom.set(tabs[0].id);
      workspaceNameAtom.set(name);
    });
  }

  afterEach(() => {
    vi.useRealTimers();
    workspaceNameAtom.set(null);
    tabsAtom.set([]);
    activeTabIdAtom.set(null);
  });

  it("marks the first tab change after a workspace opens, and autosaves it 2 s later", async () => {
    vi.useFakeTimers();
    renderWorkspaces(true);
    open("Work", [tab("one")]);
    expect(workspaceHasChangesAtom.get()).toBe(false);

    const changed = [tab("one"), tab("two")];
    act(() => tabsAtom.set(changed));
    expect(workspaceHasChangesAtom.get()).toBe(true);

    act(() => vi.advanceTimersByTime(1999));
    expect(saveWorkspace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    vi.useRealTimers();

    await waitFor(() => expect(workspaceHasChangesAtom.get()).toBe(false));
    expect(saveWorkspace).toHaveBeenCalledTimes(1);
    expect(saveWorkspace).toHaveBeenCalledWith("Work", changed, "one");
  });

  it("keeps a change made while a save was in flight marked once the save lands", async () => {
    let finishSave = () => {};
    saveWorkspace.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSave = () => resolve({ workspaces: [] });
        }),
    );
    const { result } = renderWorkspaces(false);
    open("Work", [tab("one")]);
    const saved = [tab("one"), tab("two")];
    act(() => tabsAtom.set(saved));

    act(() => result.current.saveWorkspace("Work"));
    await waitFor(() => expect(saveWorkspace).toHaveBeenCalled());
    act(() => tabsAtom.set([...saved, tab("three")]));
    await act(async () => finishSave());

    expect(previousTabsSnapshotAtom.get()).toBe(JSON.stringify(saved));
    expect(workspaceHasChangesAtom.get()).toBe(true);
  });

  it("keeps a change made while saving unchanged tabs marked once the save lands", async () => {
    let finishSave = () => {};
    saveWorkspace.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSave = () => resolve({ workspaces: [] });
        }),
    );
    const { result } = renderWorkspaces(false);
    open("Work", [tab("one")]);

    act(() => result.current.saveWorkspace("Work"));
    await waitFor(() => expect(saveWorkspace).toHaveBeenCalled());
    act(() => tabsAtom.set([tab("one"), tab("two")]));
    await act(async () => finishSave());

    expect(workspaceHasChangesAtom.get()).toBe(true);
  });

  it("starts a newly opened workspace unchanged, without saving it", () => {
    vi.useFakeTimers();
    renderWorkspaces(true);
    open("Work", [tab("one")]);
    act(() => tabsAtom.set([tab("one"), tab("two")]));
    expect(workspaceHasChangesAtom.get()).toBe(true);

    open("Other", [tab("three")]);

    expect(workspaceHasChangesAtom.get()).toBe(false);
    expect(previousTabsSnapshotAtom.get()).toBe(JSON.stringify([tab("three")]));
    act(() => vi.advanceTimersByTime(2000));
    expect(saveWorkspace).not.toHaveBeenCalled();
  });
});
