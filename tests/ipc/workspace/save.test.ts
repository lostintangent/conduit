import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {},
  dialog: {},
  ipcMain: { handle: vi.fn() },
}));

import { removeTerminal, storeTerminal } from "../../../src/ipc/terminal/store";
import type { TerminalInstance } from "../../../src/ipc/terminal/types";
import initializeWorkspaceHandlers, {
  saveWorkspace,
} from "../../../src/ipc/workspace";
import type { Tab } from "../../../src/renderer/types";

describe("saveWorkspace", () => {
  it("records each terminal's PTY size", async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), "conduit-workspaces-"));
    storeTerminal({
      id: "session-1",
      pty: { pid: -1, cols: 132, rows: 41 },
      lastProcessName: "zsh",
      isRendererReady: true,
      bufferedOutput: [],
      cwd: "/tmp",
    } as unknown as TerminalInstance);

    try {
      await initializeWorkspaceHandlers(stateDirectory, async () => {});
      const tab = {
        id: "tab-1",
        name: "Shell",
        panes: {
          a: { id: "a", type: "terminal", sessionId: "session-1", cwd: "/tmp" },
        },
        layout: { id: "node-a", type: "pane", paneId: "a" },
        activePaneId: "a",
      } as unknown as Tab;

      const state = await saveWorkspace("Work", [tab], "tab-1");

      expect(state?.workspaces[0].tabs[0].panes[0]).toMatchObject({
        cols: 132,
        rows: 41,
      });
    } finally {
      removeTerminal("session-1");
      await rm(stateDirectory, { recursive: true, force: true });
    }
  });
});
