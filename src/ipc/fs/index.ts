import { BrowserWindow, ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import { FSWatcher, promises as fsPromises } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { listDirectory, readFile } from "./utils";

// Store active file watchers
const fileWatchers = new Map<string, FSWatcher>();

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

  ipcMain.handle(
    "fs:write-file",
    async (_, filePath: string, content: string) => {
      try {
        const fs = require("node:fs").promises;
        const path = require("node:path");

        // Ensure directory exists
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });

        // Write file
        await fs.writeFile(filePath, content, "utf8");
      } catch (error) {
        console.error("Failed to write file", filePath, error);
        throw error;
      }
    },
  );

  ipcMain.handle("fs:delete-file", async (_, filePath: string) => {
    try {
      const fs = require("node:fs").promises;

      // Delete file
      await fs.unlink(filePath);
    } catch (error) {
      console.error("Failed to delete file", filePath, error);
      throw error;
    }
  });

  ipcMain.handle(
    "fs:write-temp-file",
    async (_, data: Uint8Array, extension = "") => {
      try {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

        const normalizedExtension = extension
          ? extension.startsWith(".")
            ? extension
            : `.${extension}`
          : "";

        const fileName = `conduit-${randomUUID()}${normalizedExtension}`;
        const filePath = path.join(tmpdir(), fileName);

        await fsPromises.writeFile(filePath, buffer);
        return filePath;
      } catch (error) {
        console.error("Failed to write temp file", error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    "fs:watch-file",
    async (event, filePath: string, watcherId: string) => {
      try {
        const fs = require("node:fs");

        // Check if file exists before watching
        if (!fs.existsSync(filePath)) {
          console.log(
            `File ${filePath} does not exist yet, will watch parent directory`,
          );
        }

        // Create watcher
        const watcher = fs.watch(filePath, (eventType: string) => {
          if (eventType === "change") {
            // Notify renderer process
            const window = BrowserWindow.getAllWindows()[0];
            if (window) {
              window.webContents.send("fs:file-changed", {
                watcherId,
                filePath,
              });
            }
          }
        });

        // Store watcher
        fileWatchers.set(watcherId, watcher);
      } catch (error) {
        console.error("Failed to watch file", filePath, error);
      }
    },
  );

  ipcMain.handle("fs:unwatch-file", async (_, watcherId: string) => {
    const watcher = fileWatchers.get(watcherId);
    if (watcher) {
      watcher.close();
      fileWatchers.delete(watcherId);
    }
  });
}
