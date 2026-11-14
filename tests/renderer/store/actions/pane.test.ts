import { beforeEach, describe, expect, it, vi } from "vitest";

const { createTerminal, spawnAgentSession } = vi.hoisted(() => {
  const createTerminal = vi.fn();
  const spawnAgentSession = vi.fn();
  (window as any).conduit = {
    terminal: { create: createTerminal },
    spawnAgentSession,
  };
  return { createTerminal, spawnAgentSession };
});

import {
  dropPane,
  splitPane,
  splitPaneWithAgentSession,
} from "@/store/actions/pane";
import { activeTabIdAtom, tabsAtom } from "@/store/atoms";
import type { LayoutNode, Pane, Tab } from "@/types";
import { enableMapSet } from "immer";

enableMapSet();

const browserPane = (id: string): Pane => ({
  id,
  type: "browser",
  url: "https://example.com",
});

const leaf = (paneId: string): LayoutNode => ({
  id: `node-${paneId}`,
  type: "pane",
  paneId,
});

function makeTab(id: string, paneIds: string[], locked = false): Tab {
  return {
    id,
    name: id,
    locked,
    panes: Object.fromEntries(paneIds.map((p) => [p, browserPane(p)])),
    layout:
      paneIds.length === 1
        ? leaf(paneIds[0])
        : {
            id: `split-${id}`,
            type: "split",
            direction: "row",
            children: paneIds.map(leaf),
          },
    activePaneId: paneIds[0],
  };
}

describe("dropPane", () => {
  beforeEach(() => {
    tabsAtom.set([makeTab("tab-1", ["a"]), makeTab("tab-2", ["b"])]);
    activeTabIdAtom.set("tab-1");
  });

  it("keeps a tab's only pane when it is dropped on its own tab edge", () => {
    const before = tabsAtom.get();

    const moved = dropPane("tab-1", "a", {
      tabId: "tab-1",
      direction: "row",
      insertBefore: false,
    });

    expect(moved).toBe(false);
    expect(tabsAtom.get()).toEqual(before);
  });

  it("moves a pane to the edge of another tab and closes the emptied tab", () => {
    activeTabIdAtom.set("tab-2");

    const moved = dropPane("tab-1", "a", {
      tabId: "tab-2",
      direction: "column",
      insertBefore: true,
    });

    expect(moved).toBe(true);
    const tabs = tabsAtom.get();
    expect(tabs.map((tab) => tab.id)).toEqual(["tab-2"]);
    expect(Object.keys(tabs[0].panes)).toEqual(["b", "a"]);
    expect(tabs[0].layout).toMatchObject({
      type: "split",
      direction: "column",
      children: [{ paneId: "a" }, { paneId: "b" }],
    });
    expect(tabs[0].activePaneId).toBe("a");
  });

  it("leaves the pane in place when the target tab is locked", () => {
    tabsAtom.set([makeTab("tab-1", ["a"]), makeTab("tab-2", ["b"], true)]);
    const before = tabsAtom.get();

    const moved = dropPane("tab-1", "a", {
      tabId: "tab-2",
      targetPaneId: "b",
      direction: "row",
      insertBefore: false,
    });

    expect(moved).toBe(false);
    expect(tabsAtom.get()).toEqual(before);
  });
});

describe("splitPane", () => {
  const terminalPane = (id: string): Pane => ({
    id,
    type: "terminal",
    sessionId: `session-${id}`,
    cwd: "/home/user",
    title: "zsh",
  });

  function setTab(layout: LayoutNode, paneIds: string[]) {
    tabsAtom.set([
      {
        id: "tab-1",
        name: "tab-1",
        panes: Object.fromEntries(paneIds.map((p) => [p, terminalPane(p)])),
        layout,
        activePaneId: paneIds[0],
      },
    ]);
  }

  beforeEach(() => {
    createTerminal.mockReset();
    createTerminal.mockResolvedValue({ sessionId: "new", title: "zsh" });
  });

  it("starts a split in the visible tab once it has fit", async () => {
    setTab(leaf("a"), ["a"]);
    activeTabIdAtom.set("tab-1");

    await splitPane("tab-1", "a", "row");

    expect(createTerminal).toHaveBeenCalledWith({
      cwd: "/home/user",
      waitForSize: true,
    });
  });

  it("starts a split in a background tab right away", async () => {
    setTab(leaf("a"), ["a"]);
    activeTabIdAtom.set("tab-2");

    await splitPane("tab-1", "a", "row");

    expect(createTerminal).toHaveBeenCalledWith({
      cwd: "/home/user",
      waitForSize: false,
    });
  });

  it("starts a split from an editor in the editor's folder and agent session", async () => {
    const agent = {
      agentSessionId: "agent-1",
      agentBranchName: "agent/one",
      agentBaseBranch: "main",
      agentRepoRoot: "/repo",
      agentWorktreePath: "/worktrees/agent-1",
    };
    tabsAtom.set([
      {
        id: "tab-1",
        name: "tab-1",
        panes: {
          a: { id: "a", type: "editor", cwd: "/worktrees/agent-1", ...agent },
        },
        layout: leaf("a"),
        activePaneId: "a",
      },
    ]);
    activeTabIdAtom.set("tab-1");

    const pane = await splitPane("tab-1", "a", "row");

    expect(createTerminal).toHaveBeenCalledWith({
      cwd: "/worktrees/agent-1",
      waitForSize: true,
    });
    expect(pane).toMatchObject({ type: "terminal", ...agent });
  });
});

describe("splitPaneWithAgentSession", () => {
  it("starts the agent's worktree from an editor pane's folder", async () => {
    tabsAtom.set([
      {
        id: "tab-1",
        name: "tab-1",
        panes: { a: { id: "a", type: "editor", cwd: "/repo" } },
        layout: leaf("a"),
        activePaneId: "a",
      },
    ]);
    activeTabIdAtom.set("tab-1");
    spawnAgentSession.mockResolvedValue({
      id: "agent-1",
      repoRoot: "/repo",
      worktreePath: "/worktrees/agent-1",
      branchName: "agent-1",
      baseRef: "main",
      createdAt: 0,
    });
    createTerminal.mockReset();
    createTerminal.mockResolvedValue({ sessionId: "new", title: "zsh" });

    await splitPaneWithAgentSession("tab-1", "a", "row");

    expect(spawnAgentSession).toHaveBeenCalledWith({ cwd: "/repo" });
    expect(createTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/worktrees/agent-1" }),
    );
    const panes = Object.values(tabsAtom.get()[0].panes);
    expect(panes).toContainEqual(
      expect.objectContaining({
        type: "terminal",
        agentSessionId: "agent-1",
        agentWorktreePath: "/worktrees/agent-1",
      }),
    );
  });
});
