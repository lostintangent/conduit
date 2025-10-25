import { BrowserWindow, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import type {
  BackgroundCommandRequest,
  UserSettings,
} from "../../shared/types";
import { updateApplicationMenu } from "./applicationMenu";
import { showContextMenu, type ContextMenuOptions } from "./contextMenu";
import { loadSettings, saveSettings } from "./settings";

let userSettings: UserSettings = null;

/**
 * Loads the user's settings and then initializes
 * the application menu from them.
 */
export async function initializeUserSettings(window: BrowserWindow) {
  userSettings = await loadSettings();

  const refreshMenu = async () => updateApplicationMenu(window, userSettings, saveSettings);
  await refreshMenu();

  return {
    refreshMenu,
  };
}

/**
 * Registers the IPC handlers for the UI channel.
 */
export function initializeUIHandlers(window: BrowserWindow) {
  ipcMain.handle("ui:get-settings", () => userSettings);

  ipcMain.handle(
    "ui:add-command-history-entry",
    async (_, command: string) => {
      const trimmedCommand = command.trim();
      const updatedHistory = [
        trimmedCommand,
        ...userSettings.commandHistory.filter(
          (entry) => entry !== trimmedCommand
        ),
      ].slice(0, 5);

      userSettings = {
        ...userSettings,
        commandHistory: updatedHistory,
      };

      await saveSettings(userSettings);

      return userSettings.commandHistory;
    }
  );

  ipcMain.handle(
    "ui:remove-command-history-entry",
    async (_, command: string) => {
      userSettings = {
        ...userSettings,
        commandHistory: userSettings.commandHistory.filter(
          (entry) => entry !== command
        ),
      };

      await saveSettings(userSettings);

      return userSettings.commandHistory;
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
