import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (window as any).conduit = { terminal: {} };
});

import { launchAgents } from "./worktreeLauncher";
import { activeTabIdAtom, tabsAtom } from "@/store/atoms";
import type { Tab } from "@/types";
import { enableMapSet } from "immer";

enableMapSet();

describe("launchAgents", () => {
  afterEach(() => {
    tabsAtom.set([]);
    activeTabIdAtom.set(null);
  });

  it("starts the first agent's terminal once its new tab has fit, since the tab is split for the others", async () => {
    // The terminal the launcher was opened from, which has fit.
    const launchedFrom: Tab = {
      id: "tab-1",
      name: "tab-1",
      panes: {
        a: { id: "a", type: "terminal", sessionId: "session-0", cwd: "/repo" },
      },
      layout: { id: "node-a", type: "pane", paneId: "a" },
      activePaneId: "a",
    };
    tabsAtom.set([launchedFrom]);
    activeTabIdAtom.set("tab-1");
    const create = vi.fn().mockResolvedValue({
      sessionId: "session-1",
      cwd: "/repo",
      title: "zsh",
    });
    (window as any).conduit.terminal.create = create;

    await launchAgents(
      {
        prompt: "fix the build",
        agentIds: ["claude"],
        agentInstances: {
          claude: { count: 2, instances: [{ id: "1" }, { id: "2" }] },
        },
        launchTarget: "same-folder",
      },
      {
        cwd: "/repo",
        agents: [
          {
            id: "claude",
            name: "Claude",
            command: "claude",
            interactiveCommand: "claude {arg}",
          },
        ],
      },
    );

    // Main types each agent's command once its shell is ready for it.
    expect(create).toHaveBeenNthCalledWith(1, {
      cwd: "/repo",
      command: 'claude "fix the build"',
      waitForSize: true,
    });
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ command: 'claude "fix the build"' }),
    );
  });
});
