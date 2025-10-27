import { ipcMain } from "electron";
import { listDirectory, readFile } from "./utils";

export function initializeFsHandlers() {
  ipcMain.handle("fs:list-directory", async (_, cwd: string) => {
    try {
      return await listDirectory(cwd);
    } catch (error) {
      console.error("Failed to list directory for", cwd, error);
      return [];
    }
  });

  ipcMain.handle("fs:read-file", async (_, filePath: string) => {
    try {
      return await readFile(filePath);
    } catch (error) {
      console.error("Failed to read file", filePath, error);
      throw error;
    }
  });

  ipcMain.handle("fs:write-file", async (_, filePath: string, content: string) => {
    try {
      await require("node:fs").promises.writeFile(filePath, content, "utf8");
    } catch (error) {
      console.error("Failed to write file", filePath, error);
      throw error;
    }
  });
}
