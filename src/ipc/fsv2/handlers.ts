/**
 * FileSystem v2 IPC Handlers - Main process handlers for filesystem operations.
 *
 * This module registers IPC handlers that expose filesystem operations
 * to renderer processes. It handles:
 * - Request/response operations (readDirectory, readFile, etc.)
 * - Event subscriptions (directory changes, file changes)
 * - Provider lifecycle management via FileSystemProviderService
 *
 * Architecture:
 * - Read/write operations are lightweight - they use direct fs calls and
 *   NEVER create FileSystemProviders or file watchers.
 * - Only explicit subscriptions create providers with watchers.
 * - This ensures operations like searching for package.json in parent
 *   directories don't accidentally create watchers for /Users or /.
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
 * - `fs-v2:subscribe` - Subscribe to provider events (creates watchers)
 * - `fs-v2:unsubscribe` - Unsubscribe from events
 */

import { ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { FileSystemProviderService } from "./FileSystemProviderService";
import type { DeleteOptions, DirectoryEntry, FileStat } from "./types";

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
 * Serialize directory entries for IPC transport.
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

/**
 * Get the filesystem provider service singleton.
 */
function getService(): FileSystemProviderService {
  return FileSystemProviderService.getInstance();
}

// ============================================================================
// Direct Filesystem Helpers
//
// These functions perform filesystem operations directly without creating
// providers or watchers. Used by read/write handlers.
// ============================================================================

/**
 * Read directory contents directly from disk.
 * Returns DirectoryEntry[] with name, path, and type.
 */
async function readDirectoryDirect(dirPath: string): Promise<DirectoryEntry[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.map((entry) => {
    // Treat symlinks as files for simplicity - the public API only exposes "file" | "directory"
    const type: "file" | "directory" = entry.isDirectory()
      ? "directory"
      : "file";
    return {
      name: entry.name,
      path: path.join(dirPath, entry.name),
      type,
    };
  });
}

/**
 * Get file stats directly from disk.
 * Returns FileStat with size, timestamps, and type.
 */
async function statDirect(filePath: string): Promise<FileStat> {
  const stats = await fs.stat(filePath);
  // Treat symlinks as files for simplicity - the public API only exposes "file" | "directory"
  const type: "file" | "directory" = stats.isDirectory() ? "directory" : "file";
  return {
    type,
    size: stats.size,
    mtime: stats.mtimeMs,
    ctime: stats.ctimeMs,
  };
}

/**
 * Check if path exists directly.
 */
async function existsDirect(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
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
  const service = getService();

  // -------------------------------------------------------------------------
  // Read Operations
  //
  // All read operations use direct fs calls and NEVER create providers.
  // This ensures operations like searching for package.json don't create
  // watchers for arbitrary directories.
  // -------------------------------------------------------------------------

  /**
   * Read directory contents.
   * Returns array of DirectoryEntry objects with name, type, and path.
   */
  ipcMain.handle(
    "fs-v2:read-directory",
    async (_, params: { dirPath: string }): Promise<object[]> => {
      const entries = await readDirectoryDirect(params.dirPath);
      return serializeDirectoryEntries(entries);
    },
  );

  /**
   * Read file contents as binary data.
   * Returns Uint8Array that can be decoded to text on renderer side.
   */
  ipcMain.handle(
    "fs-v2:read-file",
    async (_, params: { filePath: string }): Promise<Uint8Array> => {
      const content = await fs.readFile(params.filePath);
      return new Uint8Array(content);
    },
  );

  /**
   * Get file or directory stats (size, timestamps, type).
   * Returns FileStat object with metadata.
   */
  ipcMain.handle(
    "fs-v2:stat",
    async (_, params: { path: string }): Promise<object> => {
      return await statDirect(params.path);
    },
  );

  /**
   * Check if a path exists on the filesystem.
   * Returns true if file or directory exists, false otherwise.
   */
  ipcMain.handle(
    "fs-v2:exists",
    async (_, params: { path: string }): Promise<boolean> => {
      return await existsDirect(params.path);
    },
  );

  // -------------------------------------------------------------------------
  // Write Operations
  //
  // Write operations use direct fs calls. Any active file watchers will
  // detect the changes automatically via @parcel/watcher.
  // -------------------------------------------------------------------------

  /**
   * Write binary content to a file.
   * Creates parent directories if they don't exist.
   */
  ipcMain.handle(
    "fs-v2:write-file",
    async (
      _,
      params: { filePath: string; content: Uint8Array },
    ): Promise<void> => {
      // Ensure parent directory exists
      const dir = path.dirname(params.filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(params.filePath, params.content);
    },
  );

  /**
   * Delete a file or directory.
   * Options can specify recursive deletion for directories.
   */
  ipcMain.handle(
    "fs-v2:delete",
    async (
      _,
      params: { path: string; options?: DeleteOptions },
    ): Promise<void> => {
      const recursive = params.options?.recursive ?? false;
      await fs.rm(params.path, { recursive, force: false });
    },
  );

  /**
   * Rename or move a file or directory.
   */
  ipcMain.handle(
    "fs-v2:rename",
    async (_, params: { oldPath: string; newPath: string }): Promise<void> => {
      await fs.rename(params.oldPath, params.newPath);
    },
  );

  /**
   * Create a directory.
   * Creates parent directories if they don't exist.
   */
  ipcMain.handle(
    "fs-v2:create-directory",
    async (_, params: { dirPath: string }): Promise<void> => {
      await fs.mkdir(params.dirPath, { recursive: true });
    },
  );

  // -------------------------------------------------------------------------
  // Event Subscriptions
  //
  // Subscriptions hold a provider reference until explicitly unsubscribed
  // or the window closes. Events are forwarded to the renderer via IPC.
  //
  // Subscription types:
  // - "directory": Directory listing changes only
  // - "file": File content/rename/delete changes only
  // - "all": Both directory and file changes
  //
  // Optional path parameter filters events to a specific path or subtree.
  // -------------------------------------------------------------------------

  /**
   * Subscribe to filesystem events.
   * Returns a subscription ID that can be used to unsubscribe.
   * Events are sent to renderer via fs-v2:* channels.
   */
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
      const provider = await service.getProvider(params.cwd);
      const subscriptionId = generateSubscriptionId();

      const disposables: Array<{ dispose: () => void }> = [];

      // Subscribe to requested event types
      if (params.type === "directory" || params.type === "all") {
        const sub = provider.onDirectoryListingChanged((e) => {
          // Filter by path if specified (match exact path or child paths)
          if (
            params.path &&
            e.path !== params.path &&
            !e.path.startsWith(params.path + "/")
          ) {
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

      // Create combined dispose function that also releases the provider
      const dispose = () => {
        for (const d of disposables) {
          d.dispose();
        }
        service.releaseProvider(params.cwd);
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

  /**
   * Unsubscribe from filesystem events.
   * Disposes event listeners and releases the provider reference.
   */
  ipcMain.handle(
    "fs-v2:unsubscribe",
    async (_, params: { subscriptionId: string }): Promise<void> => {
      const subscription = subscriptions.get(params.subscriptionId);
      if (subscription) {
        subscription.dispose();
        subscriptions.delete(params.subscriptionId);
      }
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
 * Cleans up all subscriptions for the closing window.
 * Provider lifecycle is managed by the service's grace period.
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
}
