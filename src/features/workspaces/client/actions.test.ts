import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (window as any).conduit = {};
});

import { openWorkspace } from "./actions";
import {
  notifyDataReceived,
  onSessionStateChange,
  trackSession,
  untrackSession,
} from "@features/terminal/client/stateTracker";
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
    (window as any).conduit.terminal = { create: createTerminal };
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

  it("keeps a restored collapsed terminal from changing its tab's state", async () => {
    tabsAtom.set([]);
    let created = 0;
    (window as any).conduit.terminal = {
      create: vi.fn(async () => ({ sessionId: `session-${++created}` })),
    };
    const workspace = {
      name: "Work",
      lastModified: 0,
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          name: "Agents",
          panes: [
            { id: "a", type: "terminal", cwd: "/tmp" },
            { id: "b", type: "terminal", cwd: "/tmp" },
          ],
          layout: {
            id: "split",
            type: "split",
            direction: "row",
            children: [
              { id: "node-a", type: "pane", paneId: "a" },
              { id: "node-b", type: "pane", paneId: "b", collapsed: true },
            ],
          },
          activePaneId: "a",
        },
      ],
    } as unknown as Workspace;
    await openWorkspace(workspace);

    const changes: string[] = [];
    const unsubscribe = onSessionStateChange((sessionId, state) =>
      changes.push(`${sessionId} ${state}`),
    );
    vi.useFakeTimers();
    try {
      // Neither pane has shown, so main reports both shells' output.
      for (let elapsed = 0; elapsed < 4_000; elapsed += 500) {
        for (const sessionId of ["session-1", "session-2"]) {
          trackSession(sessionId);
          notifyDataReceived(sessionId);
        }
        vi.advanceTimersByTime(500);
      }
      vi.advanceTimersByTime(2_500);
    } finally {
      vi.useRealTimers();
      unsubscribe();
      untrackSession("session-1");
      untrackSession("session-2");
    }

    expect(changes).toEqual(["session-1 running", "session-1 idle"]);
  });
});
