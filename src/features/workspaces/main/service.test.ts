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
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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
  webContents: { fromId: () => undefined },
}));
const restoreOnAttach = vi.fn();
vi.mock("@features/browser/main/restore", () => ({
  restoreOnAttach: (pages: unknown) => restoreOnAttach(pages),
}));
const refreshApplicationMenu = vi.fn(async () => {});
vi.mock("../../../main/ui/applicationMenu", () => ({
  refreshApplicationMenu: () => refreshApplicationMenu(),
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
import type { Workspace, WorkspaceState } from "../model";
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

describe("workspaces.saveWorkspaceAs", () => {
  it("saves terminals without the session and title they only have while running", async () => {
    storeTerminal({
      id: "session-1",
      command: "npm start",
      pty: { pid: -1, cols: 132, rows: 41, process: "node" },
    } as unknown as TerminalInstance);

    try {
      const tab = {
        id: "tab-1",
        name: "Dev",
        panes: {
          a: {
            id: "a",
            type: "terminal",
            sessionId: "session-1",
            title: "npm start",
            cwd: "/tmp",
          },
          b: {
            id: "b",
            type: "terminal",
            sessionId: "session-1",
            title: "npm start",
            cwd: "/tmp",
            cloneOf: "a",
          },
        },
        layout: { id: "node-a", type: "pane", paneId: "a" },
        activePaneId: "a",
      } as unknown as Tab;

      const state = await service.saveWorkspaceAs("Dev", [tab], "tab-1");

      expect(state?.workspaces[0].tabs[0].panes).toEqual([
        {
          id: "a",
          type: "terminal",
          cwd: "/tmp",
          command: "npm start",
          cols: 132,
          rows: 41,
        },
        { id: "b", type: "terminal", cwd: "/tmp", cloneOf: "a" },
      ]);
    } finally {
      removeTerminal("session-1");
    }
  });

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

      const state = await service.saveWorkspaceAs("Work", [tab], "tab-1");

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
    await service.saveWorkspaceAs("Alpha", [], undefined);
    await service.saveWorkspaceAs("Beta", [], undefined);

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
    await service.saveWorkspaceAs("Doomed", [], undefined);
    await service.setCurrentWorkspace(null);
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

describe("workspaces.saveWorkspaceAs", () => {
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
        service.saveWorkspaceAs("Race", [tab("slow")], "tab-1"),
        service.saveWorkspaceAs("Race", [tab("fast")], "tab-1"),
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
    await service.saveWorkspaceAs("Fresh", [], undefined);

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

describe("the open workspace", () => {
  const file = path.join(home, ".conduit", "workspaces.json");
  const tab = (id: string) =>
    ({
      id,
      name: id,
      panes: { a: { id: "a", type: "editor", cwd: "/tmp" } },
      layout: { id: "node-a", type: "pane", paneId: "a" },
      activePaneId: "a",
    }) as unknown as Tab;
  const onDisk = (): WorkspaceState => JSON.parse(readFileSync(file, "utf-8"));
  const names = (state: WorkspaceState) =>
    state.workspaces.map(({ name }) => name);

  async function seed(state: object) {
    writeFileSync(file, JSON.stringify(state));
    await loadWorkspaceState();
    refreshApplicationMenu.mockClear();
  }

  beforeEach(() => seed({ workspaces: [] }));

  it("is the anonymous one, which saves without being listed, until it's saved under a name", async () => {
    let state = await service.saveWorkspace([tab("one")], "one");
    expect(state.current).toBeUndefined();
    expect(state.untitled).toMatchObject({
      tabs: [{ id: "one" }],
      activeTabId: "one",
    });
    expect(names(state)).toEqual([]);

    state = await service.saveWorkspaceAs("Reading", [tab("two")], "two");
    expect(state.current).toBe("Reading");
    // Its tabs moved into Reading, so closing Reading starts fresh
    expect(state.untitled).toBeUndefined();

    state = await service.saveWorkspace([tab("three")], "three");
    expect(state.workspaces).toMatchObject([
      { name: "Reading", tabs: [{ id: "three" }], activeTabId: "three" },
    ]);
    expect(state.untitled).toBeUndefined();
    expect(onDisk()).toEqual(state);
  });

  it("keeps the anonymous workspace while a named one is open, and goes back to it", async () => {
    await service.saveWorkspace([tab("mine")], "mine");
    await seed({ ...onDisk(), workspaces: [{ name: "Build", tabs: [] }] });

    let state = await service.setCurrentWorkspace("Build");
    expect(state.current).toBe("Build");
    await service.saveWorkspace([tab("build")], "build");

    state = await service.setCurrentWorkspace(null);
    expect(state.current).toBeUndefined();
    expect(state.untitled).toMatchObject({ tabs: [{ id: "mine" }] });
    expect(state.workspaces).toMatchObject([
      { name: "Build", tabs: [{ id: "build" }] },
    ]);
    expect(onDisk().current).toBeUndefined();

    await expect(service.setCurrentWorkspace("Gone")).rejects.toThrow(
      'Workspace "Gone" not found',
    );
  });

  it("stays open when it's renamed, and can't be deleted", async () => {
    await service.saveWorkspaceAs("Reading", [tab("one")], "one");

    const state = await service.renameWorkspace("Reading", "Notes");
    expect(state.current).toBe("Notes");
    expect(onDisk().current).toBe("Notes");

    await expect(service.deleteWorkspace("Notes")).rejects.toThrow(
      "The open workspace can't be deleted",
    );
    expect(names(service.getState())).toEqual(["Notes"]);
  });

  it("rebuilds the File menu only when the names it lists change", async () => {
    await service.saveWorkspace([tab("one")], "one");
    await service.saveWorkspace([tab("two")], "two");
    expect(refreshApplicationMenu).not.toHaveBeenCalled();

    await service.saveWorkspaceAs("Reading", [tab("two")], "two");
    expect(refreshApplicationMenu).toHaveBeenCalledTimes(1);
    await service.saveWorkspace([tab("three")], "three");
    expect(refreshApplicationMenu).toHaveBeenCalledTimes(1);

    await service.renameWorkspace("Reading", "Notes");
    expect(refreshApplicationMenu).toHaveBeenCalledTimes(2);
  });

  it("imports a workspace whose name is taken as a copy, so it can't replace the open one", async () => {
    await service.saveWorkspaceAs("Team", [tab("mine")], "mine");
    refreshApplicationMenu.mockClear();
    const template = path.join(home, "templates", "clash.yaml");
    writeFileSync(
      template,
      "name: Team\ntabs:\n  - name: Dev\n    panes:\n      - npm start\n",
    );

    for (const name of ["Team 2", "Team 3"]) {
      showOpenDialog.mockResolvedValueOnce({ filePaths: [template] });
      await expect(service.importFromFile()).resolves.toMatchObject({ name });
    }

    expect(service.getState()).toMatchObject({
      current: "Team",
      workspaces: [
        { name: "Team 3" },
        { name: "Team 2" },
        { name: "Team", tabs: [{ id: "mine" }] },
      ],
    });
    expect(refreshApplicationMenu).toHaveBeenCalledTimes(2);
  });

  it("keeps its pages' history from the window, and gives it back to them as they reopen", async () => {
    const history = (url: string) => ({
      index: 0,
      entries: [{ url, title: url, pageState: "scrolled" }],
    });
    const savedTab = (paneId: string, url: string) => ({
      id: "t",
      panes: [{ id: paneId, type: "browser", url, navigation: history(url) }],
      layout: { id: "node", type: "pane", paneId },
      activePaneId: paneId,
    });
    await seed({
      workspaces: [{ name: "Docs", tabs: [savedTab("p", "https://p.com/")] }],
      untitled: { tabs: [savedTab("u", "https://u.com/")] },
      current: "Docs",
    });
    expect(JSON.stringify(service.getState())).not.toContain("navigation");

    await expect(service.stagePages("Docs")).resolves.toEqual(["p"]);
    expect(restoreOnAttach).toHaveBeenLastCalledWith(
      new Map([["p", history("https://p.com/")]]),
    );
    await expect(service.stagePages(null)).resolves.toEqual(["u"]);

    // Its page hasn't attached since it reopened
    const reopened = {
      id: "t",
      panes: { p: { id: "p", type: "browser", url: "https://p.com/" } },
      layout: { id: "node", type: "pane", paneId: "p" },
      activePaneId: "p",
    } as unknown as Tab;
    const state = await service.saveWorkspaceAs("Copy", [reopened], "t");
    expect(JSON.stringify(state)).not.toContain("navigation");
    expect(onDisk().workspaces[0]).toMatchObject({
      name: "Copy",
      tabs: [{ panes: [{ id: "p", navigation: history("https://p.com/") }] }],
    });
  });

  it("keeps a last session that couldn't reopen in the list, where the window's new tab can't save over it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 15, 13, 25));
    const work = { name: "Work", lastModified: 0, tabs: [] };
    await seed({ workspaces: [work], untitled: { tabs: [tab("mine")] } });

    const recovered = await service.recoverLastSession();
    expect(recovered).toMatch(/^Recovered Nov 15\b.*\b1:25\sPM$/);
    let state = service.getState();
    expect(state).toMatchObject({
      workspaces: [{ name: recovered, tabs: [{ id: "mine" }] }, work],
    });
    expect(state.untitled).toBeUndefined();
    expect(onDisk()).toEqual(state);
    expect(refreshApplicationMenu).toHaveBeenCalledOnce();

    // A named workspace stays where it is, and the unnamed tabs it replaced
    // are kept too
    await seed({ ...state, untitled: { tabs: [tab("old")] }, current: "Work" });
    await expect(service.recoverLastSession()).resolves.toBe("Work");
    state = service.getState();
    expect(state.current).toBeUndefined();
    expect(names(state)).toEqual([`${recovered} 2`, recovered, "Work"]);

    await expect(service.recoverLastSession()).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe("loadWorkspaceState", () => {
  it("makes the last session the anonymous workspace, and drops its leaked copies", async () => {
    const file = path.join(home, ".conduit", "workspaces.json");
    const last = {
      name: "__last_workspace__",
      lastModified: 1,
      tabs: [{ id: "last" }],
      activeTabId: "last",
    };
    writeFileSync(
      file,
      JSON.stringify({
        workspaces: [
          { ...last, tabs: [] },
          { name: "Build", tabs: [] },
        ],
        lastWorkspace: last,
      }),
    );

    await loadWorkspaceState();

    expect(service.getState()).toEqual({
      workspaces: [{ name: "Build", tabs: [] }],
      untitled: {
        lastModified: 1,
        tabs: [{ id: "last" }],
        activeTabId: "last",
      },
    });
  });
});
