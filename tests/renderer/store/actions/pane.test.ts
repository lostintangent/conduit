import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (window as any).conduit = {};
});

import { dropPane } from "@/store/actions/pane";
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
