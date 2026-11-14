import { BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import type { BackgroundCommandRequest } from "../../shared/types";
import { updateApplicationMenu } from "./applicationMenu";
import { showContextMenu, type ContextMenuOptions } from "./contextMenu";

let menuWindow: BrowserWindow | undefined;

/** Builds the application menu for `window`, which each refresh rebuilds. */
export async function initializeApplicationMenu(window: BrowserWindow) {
  menuWindow = window;
  await refreshApplicationMenu();
}

export async function refreshApplicationMenu() {
  if (menuWindow) await updateApplicationMenu(menuWindow);
}

/**
 * Registers the IPC handlers for the UI channel.
 */
export function initializeUIHandlers(window: BrowserWindow) {
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

  ipcMain.handle("ui:show-item-in-folder", (_, path: string) => {
    shell.showItemInFolder(path);
  });

  ipcMain.on("ui:write-clipboard", (_, text: string) => {
    clipboard.writeText(text).catch((error) => {
      console.error("[UI] Failed to write to the clipboard:", error);
    });
  });
}
