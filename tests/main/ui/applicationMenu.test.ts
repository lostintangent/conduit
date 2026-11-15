import { Menu } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
const reload = vi.hoisted(() => vi.fn());
const workspace = vi.hoisted(() => ({ name: "conduit", tabs: [] }));

vi.mock("electron", () => ({
  app: { name: "Conduit" },
  autoUpdater: {},
  BrowserWindow: {
    getAllWindows: () => [
      { webContents: { send }, getParentWindow: () => null, reload },
    ],
  },
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

type Item = {
  label?: string;
  role?: string;
  submenu?: Item[];
  click?: () => void;
};

async function menuItems(menuLabel: string) {
  await refreshApplicationMenu();
  const menu = vi.mocked(Menu.setApplicationMenu).mock.lastCall?.[0];
  const items = (menu as unknown as Item[]).find(
    ({ label }) => label === menuLabel,
  )?.submenu;
  return items ?? [];
}

async function fileMenuItem(label: string) {
  return (await menuItems("File")).find((item) => item.label === label);
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

    // By name, since the menu is only rebuilt when the names change, so the
    // workspace it was built with can be out of date
    expect(send).toHaveBeenCalledWith("workspaces:openRequested", "conduit");
  });

  // The reload role brings ⌘R with it, which would beat a browser pane's
  // Reload Page
  it("reloads Conduit's window in development builds without taking ⌘R", async () => {
    const view = await menuItems("View");
    expect(view.some(({ role }) => role === "reload")).toBe(false);

    view.find(({ label }) => label === "Reload")?.click?.();

    expect(reload).toHaveBeenCalledOnce();
  });
});
