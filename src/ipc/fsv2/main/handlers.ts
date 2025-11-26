/**
 * FileSystem v2 IPC Handlers - Main process handlers for filesystem operations.
 *
 * This module registers IPC handlers that expose the FileSystemProvider API
 * to renderer processes. It handles:
 * - Request/response operations (readDirectory, readFile, etc.)
 * - Event subscriptions (directory changes, file changes)
 * - Provider lifecycle management (acquire/release)
 *
 * IPC Channels:
 * - `fs-v2:read-directory` - Read directory contents
 * - `fs-v2:read-file` - Read file contents
 * - `fs-v2:write-file` - Write file contents
 * - `fs-v2:delete` - Delete file or directory
 * - `fs-v2:rename` - Rename/move file or directory
 * - `fs-v2:create-directory` - Create directory
 * - `fs-v2:stat` - Get file/directory stats
 * - `fs-v2:exists` - Check if path exists
 * - `fs-v2:search` - Search for files
 * - `fs-v2:subscribe` - Subscribe to provider events
 * - `fs-v2:unsubscribe` - Unsubscribe from events
 * - `fs-v2:release` - Release provider reference
 *
 * @see docs/architecture/filesystem-provider-design-narrative.md
 */

import { ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import type { DiskFileSystemProvider } from "../providers/DiskFileSystemProvider";
import type { DirectoryEntry, FileStat, DeleteOptions } from "../types";
import {
  getFileSystemProvider,
  releaseFileSystemProvider,
  addFileSystemSubscription,
  cleanupWindow,
} from "./windowTracking";

// ============================================================================
// Types
// ============================================================================

/**
 * Subscription tracking for event forwarding.
 */
interface Subscription {
  id: string;
  windowId: number;
  cwd: string;
  type: "directory" | "file" | "all";
  path?: string;
  dispose: () => void;
}

// ============================================================================
// State
// ============================================================================

/** Active subscriptions by ID */
const subscriptions = new Map<string, Subscription>();

/** Counter for generating unique subscription IDs */
let subscriptionIdCounter = 0;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get window ID from IPC event.
 */
function getWindowId(event: IpcMainInvokeEvent): number {
  return event.sender.id;
}

/**
 * Generate a unique subscription ID.
 */
function generateSubscriptionId(): string {
  return `fs-sub-${++subscriptionIdCounter}`;
}

/**
 * Serialize a FileStat for IPC transport.
 *
 * FileStat already uses timestamps (numbers), so no conversion needed.
 */
function serializeFileStat(stat: FileStat): object {
  return stat;
}

/**
 * Serialize directory entries for IPC transport.
 *
 * DirectoryEntry is already plain data, no conversion needed.
 */
function serializeDirectoryEntries(entries: DirectoryEntry[]): object[] {
  return entries;
}

/**
 * Send event to renderer if the WebContents is still valid.
 */
function sendToRenderer(
  sender: WebContents,
  channel: string,
  payload: unknown,
): void {
  if (!sender.isDestroyed()) {
    sender.send(channel, payload);
  }
}

// ============================================================================
// IPC Handlers
// ============================================================================

/**
 * Initialize all FileSystem v2 IPC handlers.
 *
 * Call this during main process initialization.
 */
export function initializeFileSystemV2Handlers(): void {
  // -------------------------------------------------------------------------
  // Read Operations
  // -------------------------------------------------------------------------

  ipcMain.handle(
    "fs-v2:read-directory",
    async (
      event,
      params: { cwd: string; dirPath: string },
    ): Promise<object[]> => {
      const windowId = getWindowId(event);
      const provider = await getFileSystemProvider(windowId, params.cwd);

      try {
        const entries = await provider.readDirectory(params.dirPath);
        return serializeDirectoryEntries(entries);
      } finally {
        // Release the temporary reference (we acquired one just for this call)
        releaseFileSystemProvider(windowId, params.cwd);
      }
    },
  );

  ipcMain.handle(
    "fs-v2:read-file",
    async (
      event,
      params: { cwd: string; filePath: string },
    ): Promise<Uint8Array> => {
      const windowId = getWindowId(event);
      const provider = await getFileSystemProvider(windowId, params.cwd);

      try {
        return await provider.readFile(params.filePath);
      } finally {
        releaseFileSystemProvider(windowId, params.cwd);
      }
    },
  );

  ipcMain.handle(
    "fs-v2:stat",
    async (event, params: { cwd: string; path: string }): Promise<object> => {
      const windowId = getWindowId(event);
      const provider = await getFileSystemProvider(windowId, params.cwd);

      try {
        const stat = await provider.stat(params.path);
        return serializeFileStat(stat);
      } finally {
        releaseFileSystemProvider(windowId, params.cwd);
      }
    },
  );

  ipcMain.handle(
    "fs-v2:exists",
    async (event, params: { cwd: string; path: string }): Promise<boolean> => {
      const windowId = getWindowId(event);
      const provider = await getFileSystemProvider(windowId, params.cwd);

      try {
        return await provider.exists(params.path);
      } finally {
        releaseFileSystemProvider(windowId, params.cwd);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Write Operations
  // -------------------------------------------------------------------------

  ipcMain.handle(
    "fs-v2:write-file",
    async (
      event,
      params: { cwd: string; filePath: string; content: Uint8Array },
    ): Promise<void> => {
      const windowId = getWindowId(event);
      const provider = await getFileSystemProvider(windowId, params.cwd);

      try {
        await provider.writeFile(params.filePath, params.content);
      } finally {
        releaseFileSystemProvider(windowId, params.cwd);
      }
    },
  );

  ipcMain.handle(
    "fs-v2:delete",
    async (
      event,
      params: { cwd: string; path: string; options?: DeleteOptions },
    ): Promise<void> => {
      const windowId = getWindowId(event);
      const provider = await getFileSystemProvider(windowId, params.cwd);

      try {
        await provider.delete(params.path, params.options);
      } finally {
        releaseFileSystemProvider(windowId, params.cwd);
      }
    },
  );

  ipcMain.handle(
    "fs-v2:rename",
    async (
      event,
      params: { cwd: string; oldPath: string; newPath: string },
    ): Promise<void> => {
      const windowId = getWindowId(event);
      const provider = await getFileSystemProvider(windowId, params.cwd);

      try {
        await provider.rename(params.oldPath, params.newPath);
      } finally {
        releaseFileSystemProvider(windowId, params.cwd);
      }
    },
  );

  ipcMain.handle(
    "fs-v2:create-directory",
    async (event, params: { cwd: string; dirPath: string }): Promise<void> => {
      const windowId = getWindowId(event);
      const provider = await getFileSystemProvider(windowId, params.cwd);

      try {
        await provider.createDirectory(params.dirPath);
      } finally {
        releaseFileSystemProvider(windowId, params.cwd);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Event Subscriptions
  // -------------------------------------------------------------------------

  ipcMain.handle(
    "fs-v2:subscribe",
    async (
      event,
      params: {
        cwd: string;
        type: "directory" | "file" | "all";
        path?: string;
      },
    ): Promise<string> => {
      const windowId = getWindowId(event);
      const provider = await getFileSystemProvider(windowId, params.cwd);
      const subscriptionId = generateSubscriptionId();

      const disposables: Array<{ dispose: () => void }> = [];

      // Subscribe to requested event types
      if (params.type === "directory" || params.type === "all") {
        const sub = provider.onDirectoryListingChanged((e) => {
          // Filter by path if specified
          if (params.path && !e.path.startsWith(params.path)) {
            return;
          }

          sendToRenderer(event.sender, "fs-v2:directory-listing-changed", {
            subscriptionId,
            path: e.path,
            entries: serializeDirectoryEntries(e.entries),
          });
        });
        disposables.push(sub);
      }

      if (params.type === "file" || params.type === "all") {
        const subContent = provider.onFileContentChanged((e) => {
          if (params.path && e.path !== params.path) {
            return;
          }

          sendToRenderer(event.sender, "fs-v2:file-content-changed", {
            subscriptionId,
            path: e.path,
          });
        });
        disposables.push(subContent);

        const subDeleted = provider.onFileDeleted((e) => {
          if (params.path && e.path !== params.path) {
            return;
          }

          sendToRenderer(event.sender, "fs-v2:file-deleted", {
            subscriptionId,
            path: e.path,
          });
        });
        disposables.push(subDeleted);

        const subRenamed = provider.onFileRenamed((e) => {
          if (params.path && e.oldPath !== params.path) {
            return;
          }

          sendToRenderer(event.sender, "fs-v2:file-renamed", {
            subscriptionId,
            oldPath: e.oldPath,
            newPath: e.newPath,
          });
        });
        disposables.push(subRenamed);
      }

      // Create combined dispose function
      const dispose = () => {
        for (const d of disposables) {
          d.dispose();
        }
      };

      // Track the subscription
      const subscription: Subscription = {
        id: subscriptionId,
        windowId,
        cwd: params.cwd,
        type: params.type,
        path: params.path,
        dispose,
      };

      subscriptions.set(subscriptionId, subscription);

      // Register cleanup with window tracking
      addFileSystemSubscription(windowId, params.cwd, () => {
        subscriptions.delete(subscriptionId);
        dispose();
      });

      // Clean up if window is destroyed
      event.sender.once("destroyed", () => {
        const sub = subscriptions.get(subscriptionId);
        if (sub) {
          sub.dispose();
          subscriptions.delete(subscriptionId);
        }
      });

      return subscriptionId;
    },
  );

  ipcMain.handle(
    "fs-v2:unsubscribe",
    async (_, params: { subscriptionId: string }): Promise<void> => {
      const subscription = subscriptions.get(params.subscriptionId);
      if (subscription) {
        subscription.dispose();
        subscriptions.delete(params.subscriptionId);
        releaseFileSystemProvider(subscription.windowId, subscription.cwd);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Provider Lifecycle
  // -------------------------------------------------------------------------

  ipcMain.handle(
    "fs-v2:release",
    async (event, params: { cwd: string }): Promise<void> => {
      const windowId = getWindowId(event);
      releaseFileSystemProvider(windowId, params.cwd);
    },
  );
}

/**
 * Clean up handlers and resources.
 *
 * Call this during application shutdown.
 */
export function cleanupFileSystemV2Handlers(): void {
  // Dispose all active subscriptions
  for (const subscription of subscriptions.values()) {
    try {
      subscription.dispose();
    } catch (error) {
      console.error("[FS-V2] Error disposing subscription:", error);
    }
  }

  subscriptions.clear();
}

/**
 * Handle window close event.
 *
 * This should be called when a window closes to clean up its providers.
 *
 * @param windowId - The ID of the window that closed
 */
export function handleWindowClose(windowId: number): void {
  // Clean up subscriptions for this window
  for (const [id, subscription] of subscriptions) {
    if (subscription.windowId === windowId) {
      try {
        subscription.dispose();
      } catch (error) {
        console.error("[FS-V2] Error disposing subscription:", error);
      }
      subscriptions.delete(id);
    }
  }

  // Clean up window tracking
  cleanupWindow(windowId);
}
