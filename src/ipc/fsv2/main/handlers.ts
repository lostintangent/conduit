/**
 * FileSystem v2 IPC Handlers - Main process handlers for filesystem operations.
 *
 * This module registers IPC handlers that expose the FileSystemProvider API
 * to renderer processes. It handles:
 * - Request/response operations (readDirectory, readFile, etc.)
 * - Event subscriptions (directory changes, file changes)
 * - Provider lifecycle management via FileSystemProviderService
 *
 * Architecture:
 * - Subscriptions own the provider lifecycle - they acquire a provider
 *   reference on subscribe and release it on unsubscribe/window close.
 * - One-shot operations (read, write, etc.) prefer using an existing provider
 *   from an active subscription (no refCount change). If no subscription
 *   exists, they temporarily acquire a provider and release after the operation.
 * - This hybrid approach ensures operations work standalone while optimizing
 *   for the common case of having an active subscription.
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
 * - `fs-v2:subscribe` - Subscribe to provider events
 * - `fs-v2:unsubscribe` - Unsubscribe from events
 *
 * @see docs/architecture/filesystem-provider-design-narrative.md
 */

import { ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import type { DirectoryEntry, FileStat, DeleteOptions } from "../types";
import { FileSystemProviderService } from "../services/FileSystemProviderService";

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
 */
function serializeFileStat(stat: FileStat): object {
  return stat;
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

/**
 * Result from getOrAcquireProvider - includes whether we need to release.
 */
interface ProviderHandle {
  provider: ReturnType<FileSystemProviderService["getExistingProvider"]>;
  needsRelease: boolean;
}

/**
 * Get a provider for an operation.
 *
 * If an active subscription exists, uses that provider without touching refCount.
 * Otherwise, temporarily acquires a provider which must be released after use.
 */
async function getOrAcquireProvider(cwd: string): Promise<ProviderHandle> {
  const service = getService();

  // First try existing provider (from an active subscription)
  const existing = service.getExistingProvider(cwd);
  if (existing) {
    return { provider: existing, needsRelease: false };
  }

  // No active subscription - acquire temporarily
  const provider = await service.getProvider(cwd);
  return { provider, needsRelease: true };
}

/**
 * Release a provider if it was temporarily acquired.
 */
function releaseIfNeeded(cwd: string, handle: ProviderHandle): void {
  if (handle.needsRelease) {
    getService().releaseProvider(cwd);
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
  // Operations prefer using an existing provider from an active subscription.
  // If no subscription exists, they temporarily acquire a provider.
  // -------------------------------------------------------------------------

  /**
   * Read directory contents.
   * Returns array of DirectoryEntry objects with name, type, and path.
   */
  ipcMain.handle(
    "fs-v2:read-directory",
    async (_, params: { cwd: string; dirPath: string }): Promise<object[]> => {
      const handle = await getOrAcquireProvider(params.cwd);
      try {
        const entries = await handle.provider.readDirectory(params.dirPath);
        return serializeDirectoryEntries(entries);
      } finally {
        releaseIfNeeded(params.cwd, handle);
      }
    },
  );

  /**
   * Read file contents as binary data.
   * Returns Uint8Array that can be decoded to text on renderer side.
   */
  ipcMain.handle(
    "fs-v2:read-file",
    async (
      _,
      params: { cwd: string; filePath: string },
    ): Promise<Uint8Array> => {
      const handle = await getOrAcquireProvider(params.cwd);
      try {
        return await handle.provider.readFile(params.filePath);
      } finally {
        releaseIfNeeded(params.cwd, handle);
      }
    },
  );

  /**
   * Get file or directory stats (size, timestamps, type).
   * Returns FileStat object with metadata.
   */
  ipcMain.handle(
    "fs-v2:stat",
    async (_, params: { cwd: string; path: string }): Promise<object> => {
      const handle = await getOrAcquireProvider(params.cwd);
      try {
        const stat = await handle.provider.stat(params.path);
        return serializeFileStat(stat);
      } finally {
        releaseIfNeeded(params.cwd, handle);
      }
    },
  );

  /**
   * Check if a path exists on the filesystem.
   * Returns true if file or directory exists, false otherwise.
   */
  ipcMain.handle(
    "fs-v2:exists",
    async (_, params: { cwd: string; path: string }): Promise<boolean> => {
      const handle = await getOrAcquireProvider(params.cwd);
      try {
        return await handle.provider.exists(params.path);
      } finally {
        releaseIfNeeded(params.cwd, handle);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Write Operations
  //
  // Write operations may trigger file system events that propagate to
  // subscribed renderers via the event subscription system.
  // -------------------------------------------------------------------------

  /**
   * Write binary content to a file.
   * Creates parent directories if they don't exist.
   * Triggers file content change events for subscribers.
   */
  ipcMain.handle(
    "fs-v2:write-file",
    async (
      _,
      params: { cwd: string; filePath: string; content: Uint8Array },
    ): Promise<void> => {
      const handle = await getOrAcquireProvider(params.cwd);
      try {
        await handle.provider.writeFile(params.filePath, params.content);
      } finally {
        releaseIfNeeded(params.cwd, handle);
      }
    },
  );

  /**
   * Delete a file or directory.
   * Options can specify recursive deletion for directories.
   * Triggers file deleted events for subscribers.
   */
  ipcMain.handle(
    "fs-v2:delete",
    async (
      _,
      params: { cwd: string; path: string; options?: DeleteOptions },
    ): Promise<void> => {
      const handle = await getOrAcquireProvider(params.cwd);
      try {
        await handle.provider.delete(params.path, params.options);
      } finally {
        releaseIfNeeded(params.cwd, handle);
      }
    },
  );

  /**
   * Rename or move a file or directory.
   * Triggers file renamed events for subscribers.
   */
  ipcMain.handle(
    "fs-v2:rename",
    async (
      _,
      params: { cwd: string; oldPath: string; newPath: string },
    ): Promise<void> => {
      const handle = await getOrAcquireProvider(params.cwd);
      try {
        await handle.provider.rename(params.oldPath, params.newPath);
      } finally {
        releaseIfNeeded(params.cwd, handle);
      }
    },
  );

  /**
   * Create a directory.
   * Creates parent directories if they don't exist.
   * Triggers directory listing change events for parent directory.
   */
  ipcMain.handle(
    "fs-v2:create-directory",
    async (_, params: { cwd: string; dirPath: string }): Promise<void> => {
      const handle = await getOrAcquireProvider(params.cwd);
      try {
        await handle.provider.createDirectory(params.dirPath);
      } finally {
        releaseIfNeeded(params.cwd, handle);
      }
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
