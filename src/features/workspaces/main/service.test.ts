import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
vi.mock("../../../main/ui/applicationMenu", () => ({
  refreshApplicationMenu: async () => {},
}));
// Capturing a command waits for the test terminal's `captured` signal
vi.mock("@features/terminal/main/command", () => ({
  captureTerminalCommand: async (session: {
    captured?: Promise<void>;
    command?: string;
  }) => {
    await session.captured;
    return session.command ?? null;
  },
}));

import type { Tab } from "@features/workbench/model";
import { removeTerminal, storeTerminal } from "@features/terminal/main/store";
import type { TerminalInstance } from "@features/terminal/main/types";
import type { Workspace } from "../model";
import service, { loadWorkspaceState } from "./service";

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

describe("workspaces.deleteWorkspace", () => {
  it("resolves to the workspaces left, and rejects when it can't save them", async () => {
    await service.saveWorkspace("Doomed", [], undefined);
    const { workspaces } = await service.deleteWorkspace("Doomed");
    expect(workspaces.map(({ name }) => name)).not.toContain("Doomed");

    // A folder where the file goes makes the write fail
    const file = path.join(home, ".conduit", "workspaces.json");
    rmSync(file);
    mkdirSync(file);
    try {
      await expect(service.deleteWorkspace("Work")).rejects.toThrow("EISDIR");
    } finally {
      rmSync(file, { recursive: true });
    }
  });
});

describe("workspaces.saveWorkspace", () => {
  it("lands saves in the order they were asked for", async () => {
    const terminal = (id: string, command: string, captured?: Promise<void>) =>
      ({
        id,
        command,
        captured,
        pty: { pid: -1, cols: 80, rows: 24, process: "zsh" },
      }) as unknown as TerminalInstance;
    const tab = (sessionId: string) =>
      ({
        id: "tab-1",
        name: "Shell",
        panes: { a: { id: "a", type: "terminal", sessionId, cwd: "/tmp" } },
        layout: { id: "node-a", type: "pane", paneId: "a" },
        activePaneId: "a",
      }) as unknown as Tab;
    let finishCapture!: () => void;
    storeTerminal(
      terminal("slow", "npm test", new Promise((r) => (finishCapture = r))),
    );
    storeTerminal(terminal("fast", "npm start"));

    try {
      const saves = [
        service.saveWorkspace("Race", [tab("slow")], "tab-1"),
        service.saveWorkspace("Race", [tab("fast")], "tab-1"),
      ];
      // The first save is still capturing its terminal when the second asks
      finishCapture();
      await Promise.all(saves);
    } finally {
      removeTerminal("slow");
      removeTerminal("fast");
    }

    const saved = (state: { workspaces: Workspace[] }) =>
      state.workspaces.find(({ name }) => name === "Race")?.tabs[0].panes[0];
    expect(saved(service.getState())).toMatchObject({ command: "npm start" });
    const file = path.join(home, ".conduit", "workspaces.json");
    expect(saved(JSON.parse(readFileSync(file, "utf-8")))).toMatchObject({
      command: "npm start",
    });
  });
});

describe("loadWorkspaceState", () => {
  it("moves a workspaces.json that doesn't parse aside, rather than saving over it", async () => {
    const folder = path.join(home, ".conduit");
    writeFileSync(path.join(folder, "workspaces.json"), '{"workspaces": [');

    await loadWorkspaceState();
    expect(service.getState().workspaces).toEqual([]);
    await service.saveWorkspace("Fresh", [], undefined);

    const aside = readdirSync(folder).filter((name) =>
      name.startsWith("workspaces.json.corrupt-"),
    );
    expect(aside).toHaveLength(1);
    expect(readFileSync(path.join(folder, aside[0]), "utf-8")).toBe(
      '{"workspaces": [',
    );
    expect(
      JSON.parse(readFileSync(path.join(folder, "workspaces.json"), "utf-8"))
        .workspaces,
    ).toMatchObject([{ name: "Fresh" }]);
  });
});
