import { BrowserWindow, ipcMain } from "electron";
import { FSWatcher, promises as fs } from "node:fs";
import path from "node:path";
import { getCloudEnvironmentByVmId } from "../terminal/store";
import { getVMAgentClient } from "../vm/agent-client";
import { listDirectory, readFile } from "./utils";

// Store active file watchers
const fileWatchers = new Map<string, FSWatcher>();

export function initializeFsHandlers() {
  ipcMain.handle(
    "fs:list-directory",
    async (_, dirPath: string, vmId: string | "local", rootPath?: string) => {
      try {
        // Check if this is for a cloud VM
        if (vmId && vmId !== "local") {
          const cloudEnv = getCloudEnvironmentByVmId(vmId);
          if (cloudEnv) {
            const vmAgent = getVMAgentClient();
            return await vmAgent.listDirectory(cloudEnv, dirPath, rootPath);
          }
        }

        // Local filesystem
        return await listDirectory(dirPath, rootPath);
      } catch (error) {
        console.error("Failed to list directory for", dirPath, error);
        return [];
      }
    },
  );

  ipcMain.handle(
    "fs:read-file",
    async (_, filePath: string, vmId: string | "local") => {
      try {
        // Check if this is for a cloud VM
        if (vmId !== "local") {
          const cloudEnv = getCloudEnvironmentByVmId(vmId);
          if (cloudEnv) {
            const vmAgent = getVMAgentClient();
            return await vmAgent.readFile(cloudEnv, filePath);
          }
        }

        // Local filesystem
        return await readFile(filePath);
      } catch (error) {
        console.error("Failed to read file", filePath, error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    "fs:write-file",
    async (_, filePath: string, content: string, vmId: string | "local") => {
      try {
        // Check if this is for a cloud VM
        if (vmId !== "local") {
          const cloudEnv = getCloudEnvironmentByVmId(vmId);
          if (cloudEnv) {
            const vmAgent = getVMAgentClient();
            return await vmAgent.writeFile(cloudEnv, filePath, content);
          }
        }

        // Local filesystem
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

  ipcMain.handle(
    "fs:delete-file",
    async (_, filePath: string, vmId: string | "local") => {
      try {
        // Check if this is for a cloud VM
        if (vmId !== "local") {
          const cloudEnv = getCloudEnvironmentByVmId(vmId);
          if (cloudEnv) {
            const vmAgent = getVMAgentClient();
            return await vmAgent.deleteFile(cloudEnv, filePath);
          }
        }

        // Local filesystem
        const fs = require("node:fs").promises;

        // Delete file
        await fs.unlink(filePath);
      } catch (error) {
        console.error("Failed to delete file", filePath, error);
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

  ipcMain.handle("fs:file-exists", async (_, filePath: string) => {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  });

  ipcMain.handle("fs:get-stats", async (_, filePath: string) => {
    try {
      const stats = await fs.stat(filePath);
      return {
        mtime: stats.mtime.getTime(),
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
      };
    } catch (error) {
      console.error("Failed to get file stats", filePath, error);
      throw error;
    }
  });
}
