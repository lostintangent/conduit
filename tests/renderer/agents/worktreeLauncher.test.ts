import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (window as any).conduit = { terminal: {} };
});

vi.mock("@features/terminal/client/xtermCache", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@features/terminal/client/xtermCache")
  >()),
  getTerminalSize: () => ({ cols: 120, rows: 40 }),
}));

import { launchAgents } from "@/agents/worktreeLauncher";
import { activeTabIdAtom, tabsAtom } from "@/store/atoms";
import type { Tab } from "@/types";
import { enableMapSet } from "immer";

enableMapSet();

describe("launchAgents", () => {
  afterEach(() => {
    vi.useRealTimers();
    tabsAtom.set([]);
    activeTabIdAtom.set(() => undefined);
  });

  it("starts the first agent's terminal once its new tab has fit, since the tab is split for the others", async () => {
    vi.useFakeTimers();
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
    // The launcher's splits go through the preload API.
    const terminal = Object.assign((window as any).conduit.terminal, {
      create: vi.fn().mockResolvedValue({
        sessionId: "session-1",
        cwd: "/repo",
        title: "zsh",
      }),
      input: vi.fn(),
    });
    const api = { spawnAgentSession: vi.fn(), terminal };

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
        api,
      },
    );
    await vi.advanceTimersByTimeAsync(300);

    expect(api.terminal.create).toHaveBeenNthCalledWith(1, {
      cwd: "/repo",
      waitForSize: true,
    });
    // Main holds this until the shell starts.
    expect(api.terminal.input).toHaveBeenCalledWith(
      "session-1",
      'claude "fix the build"\r',
    );
  });
});
