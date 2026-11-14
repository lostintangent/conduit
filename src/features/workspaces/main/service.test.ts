import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { OpenDialogOptions, OpenDialogReturnValue } from "electron";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const home = mkdtempSync(path.join(tmpdir(), "workspace-import-"));
const showOpenDialog =
  vi.fn<
    (options: OpenDialogOptions) => Promise<Partial<OpenDialogReturnValue>>
  >();

vi.mock("electron", () => ({
  app: { getPath: () => home },
  dialog: {
    showOpenDialog: (options: OpenDialogOptions) => showOpenDialog(options),
  },
}));
vi.mock("../../../ipc/ui", () => ({ refreshApplicationMenu: async () => {} }));

import type { Tab } from "@/types";
import { removeTerminal, storeTerminal } from "@features/terminal/main/store";
import type { TerminalInstance } from "@features/terminal/main/types";
import service from "./service";

beforeAll(() => {
  mkdirSync(path.join(home, ".conduit"));
  mkdirSync(path.join(home, "templates"));
});

afterAll(() => rmSync(home, { recursive: true, force: true }));

describe("workspaces.importFromFile", () => {
  it("opens in home, then in the folder of the last file picked", async () => {
    const file = path.join(home, "templates", "team.yaml");
    writeFileSync(
      file,
      "name: Team\ntabs:\n  - name: Dev\n    panes:\n      - npm start\n",
    );

    showOpenDialog.mockResolvedValueOnce({ filePaths: [file] });
    await expect(service.importFromFile()).resolves.toMatchObject({
      name: "Team",
    });
    showOpenDialog.mockResolvedValueOnce({ filePaths: [] });
    await expect(service.importFromFile()).resolves.toBeNull();

    expect(showOpenDialog.mock.calls.map(([o]) => o.defaultPath)).toEqual([
      home,
      path.join(home, "templates"),
    ]);
  });
});

describe("workspaces.saveWorkspace", () => {
  it("records each terminal's PTY size", async () => {
    storeTerminal({
      id: "session-1",
      pty: { pid: -1, cols: 132, rows: 41, process: "zsh" },
      isRendererReady: true,
      bufferedOutput: "",
      cwd: "/tmp",
    } as unknown as TerminalInstance);

    try {
      const tab = {
        id: "tab-1",
        name: "Shell",
        panes: {
          a: { id: "a", type: "terminal", sessionId: "session-1", cwd: "/tmp" },
        },
        layout: { id: "node-a", type: "pane", paneId: "a" },
        activePaneId: "a",
      } as unknown as Tab;

      const state = await service.saveWorkspace("Work", [tab], "tab-1");

      expect(state?.workspaces[0].tabs[0].panes[0]).toMatchObject({
        cols: 132,
        rows: 41,
      });
    } finally {
      removeTerminal("session-1");
    }
  });
});

describe("workspaces.renameWorkspace", () => {
  it("rejects instead of resolving empty when the new name is taken", async () => {
    await service.saveWorkspace("Alpha", [], undefined);
    await service.saveWorkspace("Beta", [], undefined);

    await expect(service.renameWorkspace("Alpha", "Beta")).rejects.toThrow(
      'Workspace "Beta" already exists',
    );
    await expect(service.renameWorkspace("Alpha", "Gamma")).resolves.toEqual(
      expect.objectContaining({
        workspaces: expect.arrayContaining([
          expect.objectContaining({ name: "Gamma" }),
        ]),
      }),
    );
  });
});
