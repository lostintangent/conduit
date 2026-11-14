import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { OpenDialogOptions, OpenDialogReturnValue } from "electron";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
const showOpenDialog =
  vi.fn<
    (options: OpenDialogOptions) => Promise<Partial<OpenDialogReturnValue>>
  >();

vi.mock("electron", () => ({
  app: { getPath: (name: string) => `/fake-${name}` },
  dialog: {
    showOpenDialog: (options: OpenDialogOptions) => showOpenDialog(options),
  },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => Promise<unknown>) =>
      handlers.set(channel, fn),
  },
}));

import initializeWorkspaceHandlers from "./service";

describe("workspace:import", () => {
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "workspace-import-"));
    mkdirSync(path.join(dir, "state"));
    mkdirSync(path.join(dir, "templates"));
    await initializeWorkspaceHandlers(path.join(dir, "state"), async () => {});
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("opens in home, then in the folder of the last file picked", async () => {
    const file = path.join(dir, "templates", "team.yaml");
    writeFileSync(
      file,
      "name: Team\ntabs:\n  - name: Dev\n    panes:\n      - npm start\n",
    );
    const importWorkspace = () => handlers.get("workspace:import")?.({});

    showOpenDialog.mockResolvedValueOnce({ filePaths: [file] });
    await expect(importWorkspace()).resolves.toMatchObject({ name: "Team" });
    showOpenDialog.mockResolvedValueOnce({ filePaths: [] });
    await expect(importWorkspace()).resolves.toBeNull();

    expect(showOpenDialog.mock.calls.map(([o]) => o.defaultPath)).toEqual([
      "/fake-home",
      path.join(dir, "templates"),
    ]);
  });
});
