import { beforeEach, describe, expect, it, vi } from "vitest";

const { createTerminal, getTerminalSize } = vi.hoisted(() => {
  const createTerminal = vi.fn();
  (window as any).conduit = { terminal: { create: createTerminal } };
  return { createTerminal, getTerminalSize: vi.fn() };
});

vi.mock("@features/terminal/client/xtermCache", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@features/terminal/client/xtermCache")
  >()),
  getTerminalSize,
}));

import { dropPane, splitPane } from "@/store/actions/pane";
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
    getTerminalSize.mockReset();
    getTerminalSize.mockReturnValue({ cols: 127, rows: 45 });
  });

  it("starts a right split a little narrower than half the pane", async () => {
    setTab(leaf("a"), ["a"]);

    await splitPane("tab-1", "a", "row");

    expect(createTerminal).toHaveBeenCalledWith({
      cwd: "/home/user",
      cols: 61,
      rows: 45,
    });
  });

  it("starts a down split at half the pane's rows and its full width", async () => {
    setTab(leaf("a"), ["a"]);

    await splitPane("tab-1", "a", "column");

    expect(createTerminal).toHaveBeenCalledWith({
      cwd: "/home/user",
      cols: 127,
      rows: 22,
    });
  });

  it("scales by the new pane's weight when it joins the pane's own row", async () => {
    // "a" has 3/4 of the row, and the new pane will get 1/5 of it.
    setTab(
      {
        id: "split",
        type: "split",
        direction: "row",
        children: [{ ...leaf("a"), size: 3 }, leaf("b")],
      },
      ["a", "b"],
    );
    getTerminalSize.mockReturnValue({ cols: 120, rows: 45 });

    await splitPane("tab-1", "a", "row");

    expect(createTerminal).toHaveBeenCalledWith({
      cwd: "/home/user",
      cols: 30,
      rows: 45,
    });
  });

  it("leaves the size to the shell when the pane has no measured size", async () => {
    setTab(leaf("a"), ["a"]);
    getTerminalSize.mockReturnValue(undefined);

    await splitPane("tab-1", "a", "row");

    expect(createTerminal).toHaveBeenCalledWith({ cwd: "/home/user" });
  });
});
