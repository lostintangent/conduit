/**
 * File Watcher Module
 *
 * Provides centralized file system watching capabilities for the application.
 * Supports multiple subscribers per directory, efficient resource management,
 * and event broadcasting to renderer processes.
 */

import { ipcMain } from "electron";
import { FileWatcherManager } from "./FileWatcherManager";

export { FileWatcherService } from "./FileWatcherService";
export type {
  FileChangedEvent,
  FileWatcherSubscription,
  TreeChangedEvent,
} from "./types";

/**
 * Initialize file watcher IPC handlers.
 * Should be called during application initialization in the main process.
 */
export function initializeFileWatcherHandlers(): void {
  // Use unified manager that routes to appropriate service
  const service = FileWatcherManager.getInstance();

  /**
   * Handler: file-watcher:subscribe
   * Subscribes a pane to file watching for a specific directory.
   * Automatically routes to local or VM service based on vmId.
   */
  ipcMain.handle(
    "file-watcher:subscribe",
    async (event, cwd: string, paneId: string, vmId: string | "local") => {
      try {
        const windowId = event.sender.id;
        await service.subscribe(cwd, paneId, windowId, vmId);
        return { success: true };
      } catch (error) {
        console.error("Failed to subscribe to file watcher:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  /**
   * Handler: file-watcher:unsubscribe
   * Unsubscribes a pane from file watching.
   * Automatically routes to local or VM service based on vmId.
   */
  ipcMain.handle(
    "file-watcher:unsubscribe",
    async (_, cwd: string, paneId: string, vmId: string | "local") => {
      try {
        await service.unsubscribe(cwd, paneId, vmId);
        return { success: true };
      } catch (error) {
        console.error("Failed to unsubscribe from file watcher:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  /**
   * Handler: git:get-status
   * Gets the current git status for a directory.
   */
  ipcMain.handle(
    "git:get-status",
    async (_, cwd: string, vmId: string | "local") => {
      try {
        const gitStatus = service.getGitStatus(cwd, vmId);
        // Convert Map to plain object for IPC serialization
        const statusObj = gitStatus
          ? Object.fromEntries(gitStatus.entries())
          : null;
        return { success: true, gitStatus: statusObj };
      } catch (error) {
        console.error("Failed to get git status:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  /**
   * Handler: git:set-base-branch
   * Sets the base branch for git comparison.
   */
  ipcMain.handle(
    "git:set-base-branch",
    async (
      _,
      cwd: string,
      baseBranch: string | null,
      vmId: string | "local",
    ) => {
      try {
        await service.setBaseBranch(cwd, baseBranch, vmId);
        return { success: true };
      } catch (error) {
        console.error("Failed to set base branch:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  /**
   * Handler: git:get-branches
   * Gets the list of branches for a directory.
   */
  ipcMain.handle(
    "git:get-branches",
    async (_, cwd: string, vmId: string | "local") => {
      try {
        const branches = await service.getBranches(cwd, vmId);
        return { success: true, branches };
      } catch (error) {
        console.error("Failed to get branches:", error);
        return {
          success: false,
          branches: [],
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  /**
   * Handler: git:get-most-recent-file
   * Gets the single most recently modified file (dirty file first, then tracked files).
   * All stat work is done server-side for efficiency.
   */
  ipcMain.handle(
    "git:get-most-recent-file",
    async (_, cwd: string, vmId: string | "local") => {
      try {
        const file = await service.getMostRecentFile(cwd, vmId);
        return { success: true, file };
      } catch (error) {
        console.error("Failed to get most recent file:", error);
        return {
          success: false,
          file: null,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  /**
   * Handler: git:refresh-status
   * Manually refreshes git status for a directory.
   */
  ipcMain.handle(
    "git:refresh-status",
    async (_, cwd: string, vmId: string | "local") => {
      try {
        await service.refreshGitStatus(cwd, vmId);
        return { success: true };
      } catch (error) {
        console.error("Failed to refresh git status:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  /**
   * Handler: git:get-file-diff
   * Gets the diff for a specific file.
   * Routes to VM agent if vmId indicates cloud VM.
   */
  ipcMain.handle(
    "git:get-file-diff",
    async (
      _,
      filePath: string,
      cwd: string,
      vmId: string | "local",
      baseBranch?: string | null,
    ) => {
      try {
        const diff = await service.getFileDiff(filePath, cwd, vmId, baseBranch);
        return { success: true, diff };
      } catch (error) {
        console.error("Failed to get file diff:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  /**
   * Handler: git:get-diff-stats
   * Gets aggregated diff statistics for all changed files.
   */
  ipcMain.handle(
    "git:get-diff-stats",
    async (_, cwd: string, vmId: string | "local") => {
      try {
        const stats = await service.getDiffStats(cwd, undefined, vmId);
        return { success: true, stats };
      } catch (error) {
        console.error("Failed to get diff stats:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );
}
