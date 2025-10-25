import { BrowserWindow, Menu, app } from "electron";
import type { UserSettings } from "../../shared/types";

export function updateApplicationMenu(
  window: BrowserWindow,
  settings: UserSettings,
  saveSettings: (settings: UserSettings) => Promise<void>
) {
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
                updateApplicationMenu(window, settings, saveSettings);
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
                updateApplicationMenu(window, settings, saveSettings);
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
              settings.alwaysShowTabs
            );
            updateApplicationMenu(window, settings, saveSettings);
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
              settings.showTerminalRuler
            );

            updateApplicationMenu(window, settings, saveSettings);
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
    template as Electron.MenuItemConstructorOptions[]
  );

  Menu.setApplicationMenu(menu);
}
