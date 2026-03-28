import { BrowserWindow, Menu, app, autoUpdater } from "electron";
import type { UpdateStatus, UserSettings, Workspace } from "../../shared/types";
import { getUpdateStatus } from "../updates";
import { getWorkspaces } from "../workspace";

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

export async function updateApplicationMenu(
  window: BrowserWindow,
  _settings: UserSettings,
  _saveSettings: (settings: UserSettings) => Promise<void>,
) {
  const workspaces = await getWorkspaces();
  const updateMenuItem = buildCheckForUpdatesMenuItem();

  const template = [
    ...(process.platform === "darwin"
      ? [
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
        ]
      : []),
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
        process.platform === "darwin" ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
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
    ...(process.platform !== "darwin"
      ? [
          {
            label: "Help",
            submenu: [updateMenuItem],
          },
        ]
      : []),
  ];

  const menu = Menu.buildFromTemplate(
    template as Electron.MenuItemConstructorOptions[],
  );

  Menu.setApplicationMenu(menu);
}
