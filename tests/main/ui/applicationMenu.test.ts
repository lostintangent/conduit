import { Menu } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
const workspace = vi.hoisted(() => ({ name: "conduit", tabs: [] }));

vi.mock("electron", () => ({
  app: { name: "Conduit" },
  autoUpdater: {},
  BrowserWindow: { getAllWindows: () => [{ webContents: { send } }] },
  Menu: {
    buildFromTemplate: (template: unknown) => template,
    setApplicationMenu: vi.fn(),
  },
}));
vi.mock("../../../src/features/workspaces/main/service", () => ({
  getWorkspaces: async () => [workspace],
}));
vi.mock("../../../src/features/updates/main/startup", () => ({
  getUpdateStatus: () => "idle",
}));

import { refreshApplicationMenu } from "../../../src/main/ui/applicationMenu";

type Item = { label?: string; submenu?: Item[]; click?: () => void };

async function fileMenuItem(label: string) {
  await refreshApplicationMenu();
  const menu = vi.mocked(Menu.setApplicationMenu).mock.lastCall?.[0];
  const file = (menu as unknown as Item[]).find(
    ({ label }) => label === "File",
  );
  return file?.submenu?.find((item) => item.label === label);
}

// The page hears these through `window.conduit.<feature>.on`
describe("application menu", () => {
  beforeEach(() => send.mockClear());

  it("asks the page for a new tab", async () => {
    (await fileMenuItem("New Tab"))?.click?.();

    expect(send).toHaveBeenCalledWith("workbench:newTabRequested", undefined);
  });

  it("asks the page to open the workspace picked", async () => {
    (await fileMenuItem("Open Workspace..."))?.submenu?.[0]?.click?.();

    expect(send).toHaveBeenCalledWith("workspaces:openRequested", workspace);
  });
});
