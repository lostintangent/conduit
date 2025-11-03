import { BrowserWindow, Menu, app } from "electron";
import type { UserSettings, Workspace } from "../../shared/types";
import { loadSessions } from "../workspace";

export async function updateApplicationMenu(
  window: BrowserWindow,
  settings: UserSettings,
  saveSettings: (settings: UserSettings) => Promise<void>,
) {
  const workspaces = await loadSessions();

  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
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
        {
          label: "Tab Position",
          submenu: [
            {
              label: "Top",
              type: "radio",
              checked: settings.tabPosition === "top",
              click: async () => {
                settings.tabPosition = "top";
                await saveSettings(settings);

                window.webContents.send("ui:set-tab-position", "top");
                await updateApplicationMenu(window, settings, saveSettings);
              },
            },
            {
              label: "Bottom",
              type: "radio",
              checked: settings.tabPosition === "bottom",
              click: async () => {
                settings.tabPosition = "bottom";
                await saveSettings(settings);

                window.webContents.send("ui:set-tab-position", "bottom");
                await updateApplicationMenu(window, settings, saveSettings);
              },
            },
          ],
        },
        {
          label: "Always Show Tabs",
          type: "checkbox",
          checked: settings.alwaysShowTabs,
          click: async () => {
            settings.alwaysShowTabs = !settings.alwaysShowTabs;
            await saveSettings(settings);

            window.webContents.send(
              "ui:set-always-show-tabs",
              settings.alwaysShowTabs,
            );
            await updateApplicationMenu(window, settings, saveSettings);
          },
        },
        { type: "separator" },
        {
          label: "Show Terminal Ruler",
          type: "checkbox",
          checked: settings.showTerminalRuler,
          click: async () => {
            settings.showTerminalRuler = !settings.showTerminalRuler;
            await saveSettings(settings);

            window.webContents.send(
              "ui:set-show-terminal-ruler",
              settings.showTerminalRuler,
            );

            await updateApplicationMenu(window, settings, saveSettings);
          },
        },
        { type: "separator" },
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
  ];

  const menu = Menu.buildFromTemplate(
    template as Electron.MenuItemConstructorOptions[],
  );

  Menu.setApplicationMenu(menu);
}
