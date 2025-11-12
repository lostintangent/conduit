/**
 * File Watcher Module
 *
 * Provides centralized file system watching capabilities for the application.
 * Supports multiple subscribers per directory, efficient resource management,
 * and event broadcasting to renderer processes.
 */

import { ipcMain } from "electron";
import { FileWatcherService } from "./FileWatcherService";

export { FileWatcherService } from "./FileWatcherService";
export type {
  FileWatcherSubscription,
  WatcherEntry,
  FileChangedEvent,
  TreeChangedEvent,
} from "./types";

/**
 * Initialize file watcher IPC handlers.
 * Should be called during application initialization in the main process.
 */
export function initializeFileWatcherHandlers(): void {
  const service = FileWatcherService.getInstance();

  /**
   * Handler: file-watcher:subscribe
   * Subscribes a pane to file watching for a specific directory.
   */
  ipcMain.handle(
    "file-watcher:subscribe",
    async (event, cwd: string, paneId: string) => {
      try {
        const windowId = event.sender.id;
        await service.subscribe(cwd, paneId, windowId);
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
   */
  ipcMain.handle(
    "file-watcher:unsubscribe",
    async (_, cwd: string, paneId: string) => {
      try {
        service.unsubscribe(cwd, paneId);
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
}
