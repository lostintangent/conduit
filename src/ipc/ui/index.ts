import { BrowserWindow, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import type {
  BackgroundCommandRequest,
  UserSettings,
} from "../../shared/types";
import { updateApplicationMenu } from "./applicationMenu";
import { showContextMenu, type ContextMenuOptions } from "./contextMenu";
import { loadSettings, saveSettings } from "./settings";

let userSettings: UserSettings | null = null;

const requireUserSettings = (): UserSettings => {
  if (!userSettings) {
    throw new Error("User settings have not been initialized.");
  }
  return userSettings;
};

/**
 * Loads the user's settings and then initializes
 * the application menu from them.
 */
export async function initializeUserSettings(window: BrowserWindow) {
  userSettings = await loadSettings();

  const refreshMenu = async () =>
    updateApplicationMenu(window, requireUserSettings(), saveSettings);
  await refreshMenu();

  return {
    refreshMenu,
  };
}

/**
 * Registers the IPC handlers for the UI channel.
 */
export function initializeUIHandlers(window: BrowserWindow) {
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
      return requireUserSettings();
    }
  );

  ipcMain.handle(
    "ui:add-command-history-entry",
    async (_, command: string) => {
      const currentSettings = requireUserSettings();
      const trimmedCommand = command.trim();
      const updatedHistory = [
        trimmedCommand,
        ...currentSettings.commandHistory.filter(
          (entry) => entry !== trimmedCommand
        ),
      ].slice(0, 5);

      userSettings = {
        ...currentSettings,
        commandHistory: updatedHistory,
      };

      await saveSettings(userSettings);

      return requireUserSettings().commandHistory;
    }
  );

  ipcMain.handle(
    "ui:add-url-to-history",
    async (_, url: string) => {
      const currentSettings = requireUserSettings();
      const trimmedUrl = url.trim();
      const updatedHistory = [
        trimmedUrl,
        ...currentSettings.urlHistory.filter(
          (entry) => entry !== trimmedUrl
        ),
      ].slice(0, 5);

      userSettings = {
        ...currentSettings,
        urlHistory: updatedHistory,
      };

      await saveSettings(userSettings);

      return requireUserSettings().urlHistory;
    }
  );

  ipcMain.handle(
    "ui:remove-command-history-entry",
    async (_, command: string) => {
      const currentSettings = requireUserSettings();
      userSettings = {
        ...currentSettings,
        commandHistory: currentSettings.commandHistory.filter(
          (entry) => entry !== command
        ),
      };

      await saveSettings(userSettings);

      return requireUserSettings().commandHistory;
    }
  );

  ipcMain.on("ui:show-context-menu", (_, options: ContextMenuOptions) =>
    showContextMenu(window, options)
  );

  ipcMain.handle(
    "ui:run-background-command",
    async (_, payload: BackgroundCommandRequest) => {
      const command = typeof payload?.command === "string" ? payload.command : "";
      if (command.trim().length === 0) {
        throw new Error("Command must be a non-empty string.");
      }

      const args = Array.isArray(payload?.args)
        ? payload.args.filter((value): value is string => typeof value === "string")
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
    }
  );

  ipcMain.handle("ui:open-url", async (_, url: string) =>
    shell.openExternal(url)
  );
}
