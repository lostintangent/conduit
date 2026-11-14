import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (window as any).conduit = {};
});

import { openWorkspace } from "@/store/actions/workspace";
import {
  activeTabAtom,
  activeTabIdAtom,
  tabsAtom,
  workspaceNameAtom,
} from "@/store/atoms";
import type { Workspace } from "@shared/types";
import { enableMapSet } from "immer";

enableMapSet();

describe("openWorkspace", () => {
  it("restores a saved workspace that is missing its name and active tab", async () => {
    tabsAtom.set([]);
    // A stale id from the previous workspace must not survive the restore.
    activeTabIdAtom.set("tab-1");
    const workspace = {
      lastModified: 0,
      tabs: [
        {
          id: "tab-1",
          name: "Docs",
          panes: [{ id: "a", type: "browser", url: "https://example.com" }],
          layout: { id: "node-a", type: "pane", paneId: "a" },
          activePaneId: "a",
        },
      ],
    } as unknown as Workspace;

    await openWorkspace(workspace);

    expect(tabsAtom.get().map((tab) => tab.id)).toEqual(["tab-1"]);
    expect(activeTabAtom.get()).toBeNull();
    expect(workspaceNameAtom.get()).toBeNull();
  });

  it("starts each restored terminal at the size it was saved at", async () => {
    tabsAtom.set([]);
    const createTerminal = vi.fn(async () => ({
      sessionId: "session-1",
      title: "zsh",
      cwd: "/tmp",
    }));
    (window as any).conduit.createTerminal = createTerminal;
    const workspace = {
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
    } as unknown as Workspace;

    await openWorkspace(workspace);

    expect(createTerminal).toHaveBeenCalledWith({
      cwd: "/tmp",
      command: undefined,
      cols: 132,
      rows: 41,
    });
  });
});
