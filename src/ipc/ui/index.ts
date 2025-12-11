import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import type {
  BackgroundCommandRequest,
  BrowserPage,
  UserSettings,
} from "../../shared/types";
import { updateApplicationMenu } from "./applicationMenu";
import { initializeCloudTerminalHandlers } from "./cloudTerminal";
import { showContextMenu, type ContextMenuOptions } from "./contextMenu";
import { loadSettings, saveSettings } from "./settings";

let userSettings: UserSettings | null = null;
let refreshMenuCallback: (() => Promise<void>) | null = null;

const requireUserSettings = (): UserSettings => {
  if (!userSettings) {
    throw new Error("User settings have not been initialized.");
  }
  return userSettings;
};

export function getCurrentUserSettings(): UserSettings {
  return requireUserSettings();
}

/**
 * Loads the user's settings and then initializes
 * the application menu from them.
 */
export async function initializeUserSettings(
  window: BrowserWindow,
  conduitStateDirectory: string,
) {
  userSettings = await loadSettings(conduitStateDirectory);

  const refreshMenu = async () =>
    updateApplicationMenu(window, requireUserSettings(), saveSettings);

  refreshMenuCallback = refreshMenu;
  await refreshMenu();

  return {
    refreshMenu,
  };
}

/**
 * Registers the IPC handlers for the UI channel.
 */
export function initializeUIHandlers(window: BrowserWindow) {
  // Initialize cloud terminal status handlers
  initializeCloudTerminalHandlers();

  ipcMain.handle("ui:get-settings", () => requireUserSettings());

  ipcMain.handle(
    "ui:update-settings",
    async (_, updates: Partial<UserSettings>) => {
      const currentSettings = requireUserSettings();
      userSettings = {
        ...currentSettings,
        ...updates,
      };

      await saveSettings(userSettings);
      if (refreshMenuCallback) {
        await refreshMenuCallback();
      }
      return requireUserSettings();
    },
  );

  ipcMain.handle("ui:add-command-history-entry", async (_, command: string) => {
    const currentSettings = requireUserSettings();
    const trimmedCommand = command.trim();
    const updatedHistory = [
      trimmedCommand,
      ...currentSettings.commandHistory.filter(
        (entry) => entry !== trimmedCommand,
      ),
    ].slice(0, 5);

    userSettings = {
      ...currentSettings,
      commandHistory: updatedHistory,
    };

    await saveSettings(userSettings);

    return requireUserSettings().commandHistory;
  });

  ipcMain.handle("ui:add-url-to-history", async (_, url: string) => {
    const currentSettings = requireUserSettings();
    const trimmedUrl = url.trim();
    const updatedHistory = [
      trimmedUrl,
      ...currentSettings.urlHistory.filter((entry) => entry !== trimmedUrl),
    ].slice(0, 5);

    userSettings = {
      ...currentSettings,
      urlHistory: updatedHistory,
    };

    await saveSettings(userSettings);

    return requireUserSettings().urlHistory;
  });

  ipcMain.handle("ui:remove-url-from-history", async (_, url: string) => {
    const currentSettings = requireUserSettings();
    const trimmedUrl = url.trim();

    userSettings = {
      ...currentSettings,
      urlHistory: currentSettings.urlHistory.filter(
        (entry) => entry !== trimmedUrl,
      ),
    };

    await saveSettings(userSettings);

    return requireUserSettings().urlHistory;
  });

  ipcMain.handle("ui:add-starred-page", async (_, page: BrowserPage) => {
    const currentSettings = requireUserSettings();
    const trimmedUrl = page.url.trim();
    const title = page.title.trim() || trimmedUrl;

    const updatedPages = [
      { url: trimmedUrl, title },
      ...currentSettings.starredPages.filter(
        (entry) => entry.url !== trimmedUrl,
      ),
    ];

    userSettings = {
      ...currentSettings,
      starredPages: updatedPages,
    };

    await saveSettings(userSettings);

    return requireUserSettings().starredPages;
  });

  ipcMain.handle("ui:remove-starred-page", async (_, url: string) => {
    const currentSettings = requireUserSettings();
    const trimmedUrl = url.trim();

    userSettings = {
      ...currentSettings,
      starredPages: currentSettings.starredPages.filter(
        (entry) => entry.url !== trimmedUrl,
      ),
    };

    await saveSettings(userSettings);

    return requireUserSettings().starredPages;
  });

  ipcMain.handle(
    "ui:remove-command-history-entry",
    async (_, command: string) => {
      const currentSettings = requireUserSettings();
      userSettings = {
        ...currentSettings,
        commandHistory: currentSettings.commandHistory.filter(
          (entry) => entry !== command,
        ),
      };

      await saveSettings(userSettings);

      return requireUserSettings().commandHistory;
    },
  );

  ipcMain.on("ui:show-context-menu", (_, options: ContextMenuOptions) =>
    showContextMenu(window, options),
  );

  ipcMain.handle(
    "ui:run-background-command",
    async (_, payload: BackgroundCommandRequest) => {
      const command =
        typeof payload?.command === "string" ? payload.command : "";
      if (command.trim().length === 0) {
        throw new Error("Command must be a non-empty string.");
      }

      const args = Array.isArray(payload?.args)
        ? payload.args.filter(
            (value): value is string => typeof value === "string",
          )
        : [];

      const cwd =
        typeof payload?.cwd === "string" && payload.cwd.length > 0
          ? payload.cwd
          : undefined;

      return new Promise<void>((resolve, reject) => {
        try {
          const child = spawn(command, args, {
            cwd,
            detached: true,
            stdio: "ignore",
            windowsHide: true,
          });

          const handleError = (error: Error) => {
            child.removeListener("spawn", handleSpawn);
            reject(error);
          };

          const handleSpawn = () => {
            child.removeListener("error", handleError);
            child.unref();
            resolve();
          };

          child.once("error", handleError);
          child.once("spawn", handleSpawn);
        } catch (error) {
          reject(error as Error);
        }
      });
    },
  );

  ipcMain.handle("ui:open-url", async (_, url: string) =>
    shell.openExternal(url),
  );

  ipcMain.handle("ui:show-folder-picker", async (_, defaultPath?: string) => {
    const result = await dialog.showOpenDialog(window, {
      properties: ["openDirectory"],
      defaultPath,
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // Window control handlers
  ipcMain.on("ui:window-minimize", () => {
    window.minimize();
  });

  ipcMain.on("ui:window-maximize", () => {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });

  ipcMain.on("ui:window-close", () => {
    window.close();
  });

  ipcMain.handle("ui:window-is-maximized", () => {
    return window.isMaximized();
  });

  ipcMain.handle("ui:show-item-in-folder", (_, path: string) => {
    shell.showItemInFolder(path);
  });
}
