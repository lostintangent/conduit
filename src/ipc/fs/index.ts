import { ipcMain } from "electron";
import { getFileTree, readFile } from "./utils";

export function initializeFsHandlers() {
  ipcMain.handle("fs:get-file-tree", async (_, cwd: string) => {
    if (!cwd || typeof cwd !== "string") {
      return [];
    }

    try {
      return await getFileTree(cwd);
    } catch (error) {
      console.error("Failed to read file tree for", cwd, error);
      return [];
    }
  });

  ipcMain.handle("fs:read-file", async (_, filePath: string) => {
    if (!filePath || typeof filePath !== "string") {
      throw new Error("File path must be a non-empty string.");
    }

    try {
      return await readFile(filePath);
    } catch (error) {
      console.error("Failed to read file", filePath, error);
      throw error;
    }
  });
}
