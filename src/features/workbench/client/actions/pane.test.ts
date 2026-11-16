import { beforeEach, describe, expect, it, vi } from "vitest";

const { createTerminal, spawnSession } = vi.hoisted(() => {
  const createTerminal = vi.fn();
  const spawnSession = vi.fn();
  (window as any).conduit = {
    terminal: { create: createTerminal },
    agents: { spawnSession },
  };
  return { createTerminal, spawnSession };
});

import {
  detachPane,
  dropPane,
  paneClosed,
  splitPane,
  splitPaneWithAgentSession,
} from "@features/workbench/client/actions/pane";
import {
  closeTab,
  movePaneToTab,
  openQuickTabInStrip,
} from "@features/workbench/client/actions/tab";
import {
  activeTabAtom,
  activeTabIdAtom,
  applicationModeAtom,
  setApplicationMode,
  stripTabsAtom,
  tabsAtom,
} from "@features/workbench/client/atoms";
import type { LayoutNode, Pane, Tab } from "@features/workbench/model";
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

describe("a quick pane", () => {
  const quickTab = (id: string, paneId: string): Tab => ({
    ...makeTab(id, [paneId]),
    quick: true,
  });

  beforeEach(() => {
    setApplicationMode("normal");
    tabsAtom.set([
      makeTab("tab-1", ["a"]),
      makeTab("tab-2", ["b"]),
      quickTab("quick", "q"),
    ]);
    activeTabIdAtom.set("tab-2");
  });

  it("is the tab in front, outside the strip", () => {
    expect(activeTabAtom.get()?.id).toBe("quick");
    expect(stripTabsAtom.get().map((tab) => tab.id)).toEqual([
      "tab-1",
      "tab-2",
    ]);
    expect(applicationModeAtom.get()).toBe("quick");
  });

  it("keeps the mode chosen under it, which returns once it closes", () => {
    tabsAtom.set([makeTab("tab-1", ["a"])]);
    setApplicationMode("focus");
    tabsAtom.set([makeTab("tab-1", ["a"]), quickTab("quick", "q")]);

    setApplicationMode("overview");
    expect(applicationModeAtom.get()).toBe("quick");

    closeTab("quick");
    expect(applicationModeAtom.get()).toBe("focus");
  });

  it("leaves the strip's selection alone when it closes", () => {
    closeTab("quick");

    expect(tabsAtom.get().map((tab) => tab.id)).toEqual(["tab-1", "tab-2"]);
    expect(activeTabIdAtom.get()).toBe("tab-2");
  });

  it("isn't selected when the strip's selected tab closes", () => {
    closeTab("tab-2");
    expect(activeTabIdAtom.get()).toBe("tab-1");

    tabsAtom.set([
      makeTab("tab-1", ["a"]),
      makeTab("tab-2", ["b"]),
      quickTab("quick", "q"),
    ]);
    activeTabIdAtom.set("tab-2");
    detachPane("tab-2", "b");
    expect(activeTabIdAtom.get()).toBe("tab-1");
  });

  it("doesn't count toward the strip, which gets a new tab once its last one closes", () => {
    createTerminal.mockReset();
    createTerminal.mockResolvedValue(null);
    tabsAtom.set([makeTab("tab-1", ["a"]), quickTab("quick", "q")]);
    activeTabIdAtom.set("tab-1");

    closeTab("tab-1");

    expect(activeTabIdAtom.get()).toBeNull();
    expect(createTerminal).toHaveBeenCalled();
  });

  it("joins the strip in place, selected, when it opens in a tab", () => {
    openQuickTabInStrip("quick");

    expect(stripTabsAtom.get().map((tab) => tab.id)).toEqual([
      "tab-1",
      "tab-2",
      "quick",
    ]);
    expect(activeTabIdAtom.get()).toBe("quick");
    expect(applicationModeAtom.get()).toBe("normal");
  });
});

describe("paneClosed", () => {
  beforeEach(() => {
    tabsAtom.set([makeTab("tab-1", ["a"]), makeTab("tab-2", ["b", "c"])]);
    activeTabIdAtom.set("tab-1");
  });

  it("waits while the pane moves to another tab, and resolves once it closes", async () => {
    let closed = false;
    const waiting = paneClosed("c").then(() => {
      closed = true;
    });

    movePaneToTab("tab-2", "c");
    // The check for a pane that left one tab runs in a microtask
    await Promise.resolve();
    expect(closed).toBe(false);

    const tabId = tabsAtom.get().find((tab) => "c" in tab.panes)!.id;
    closeTab(tabId);
    await waiting;
    expect(closed).toBe(true);
  });

  it("resolves at once for a pane that isn't open", async () => {
    await expect(paneClosed("missing")).resolves.toBeUndefined();
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
    spawnSession.mockResolvedValue({
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

    expect(spawnSession).toHaveBeenCalledWith("/repo");
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
