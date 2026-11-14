import { BrowserWindow, Menu, app, autoUpdater } from "electron";
import type { Workspace } from "../../shared/types";
import { getUpdateStatus } from "@features/updates/main/startup";
import type { UpdateStatus } from "@features/updates/model";
import { getWorkspaces } from "@features/workspaces/main/service";

function getUpdateMenuLabel(status: UpdateStatus) {
  switch (status) {
    case "checking":
      return "Checking for update...";
    case "downloading":
      return "Downloading update...";
    case "downloaded":
      return "Restart to update...";
    default:
      return "Check for update...";
  }
}

function buildCheckForUpdatesMenuItem(): Electron.MenuItemConstructorOptions {
  const status = getUpdateStatus();

  // Set the menu item's label and enabled state based on update status
  const label = getUpdateMenuLabel(status);
  const enabled = ["idle", "downloaded"].includes(status);

  return {
    label,
    enabled,
    click: () => {
      if (status === "downloaded") {
        autoUpdater.quitAndInstall();
      } else if (status === "idle") {
        autoUpdater.checkForUpdates();
      }
    },
  };
}

export async function updateApplicationMenu(window: BrowserWindow) {
  const workspaces = await getWorkspaces();
  const updateMenuItem = buildCheckForUpdatesMenuItem();

  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        updateMenuItem,
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "New Tab",
          accelerator: "Cmd+T",
          click: () => {
            if (!window.isDestroyed()) {
              window.webContents.send("ui:new-tab-request");
            }
          },
        },
        ...(workspaces.length > 0
          ? [
              { type: "separator" },
              {
                label: "Open Workspace...",
                submenu: workspaces.map((workspace: Workspace) => ({
                  label: workspace.name,
                  click: () => {
                    if (!window.isDestroyed()) {
                      window.webContents.send(
                        "ui:open-workspace-request",
                        workspace,
                      );
                    }
                  },
                })),
              },
            ]
          : []),
        { type: "separator" },
        { role: "close" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        // A reload closes every shell, which would lose running agents, so
        // only development builds offer it.
        ...(app.isPackaged ? [] : [{ role: "reload" }]),
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];

  const menu = Menu.buildFromTemplate(
    template as Electron.MenuItemConstructorOptions[],
  );

  Menu.setApplicationMenu(menu);
}
