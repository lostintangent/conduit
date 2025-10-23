import { BrowserWindow, Menu, app } from "electron";
import type { AppPreferences } from "../../shared/types";

export function updateApplicationMenu(
  window: BrowserWindow,
  preferences: AppPreferences,
  savePreferences: (preferences: AppPreferences) => Promise<void>
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
              checked: preferences.tabPosition === "top",
              click: async () => {
                preferences.tabPosition = "top";
                await savePreferences(preferences);

                window.webContents.send("ui:set-tab-position", "top");
                updateApplicationMenu(window, preferences, savePreferences);
              },
            },
            {
              label: "Bottom",
              type: "radio",
              checked: preferences.tabPosition === "bottom",
              click: async () => {
                preferences.tabPosition = "bottom";
                await savePreferences(preferences);

                window.webContents.send("ui:set-tab-position", "bottom");
                updateApplicationMenu(window, preferences, savePreferences);
              },
            },
          ],
        },
        {
          label: "Always Show Tab Strip",
          type: "checkbox",
          checked: preferences.alwaysShowTabStrip,
          click: async () => {
            preferences.alwaysShowTabStrip = !preferences.alwaysShowTabStrip;
            await savePreferences(preferences);

            window.webContents.send(
              "ui:set-always-show-tab-strip",
              preferences.alwaysShowTabStrip
            );
            updateApplicationMenu(window, preferences, savePreferences);
          },
        },
        {
          label: "Show Overview Ruler",
          type: "checkbox",
          checked: preferences.showOverviewRuler,
          click: async () => {
            preferences.showOverviewRuler = !preferences.showOverviewRuler;
            await savePreferences(preferences);

            window.webContents.send(
              "ui:set-show-overview-ruler",
              preferences.showOverviewRuler
            );

            updateApplicationMenu(window, preferences, savePreferences);
          },
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
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
