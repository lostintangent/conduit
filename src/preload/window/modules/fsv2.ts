/**
 * FileSystem v2 Preload Module
 *
 * Exposes the filesystem provider v2 IPC channels to the renderer process.
 * This module provides low-level access to filesystem operations. For a
 * higher-level API with subscription management, use the FileSystemV2API
 * class in the renderer.
 *
 * @see src/renderer/api/FileSystemV2API.ts
 * @see src/ipc/fsv2/main/handlers.ts
 */

import { ipcRenderer } from "electron";
import { createEventListener } from "../utils";
import type {
  DirectoryEntry,
  FileStat,
  DeleteOptions,
} from "../../../ipc/fsv2/types";

// ============================================================================
// Types
// ============================================================================

/**
 * Payload for directory listing changed events.
 */
export interface DirectoryListingChangedPayload {
  subscriptionId: string;
  path: string;
  entries: DirectoryEntry[];
}

/**
 * Payload for file content changed events.
 */
export interface FileContentChangedPayload {
  subscriptionId: string;
  path: string;
}

/**
 * Payload for file deleted events.
 */
export interface FileDeletedPayload {
  subscriptionId: string;
  path: string;
}

/**
 * Payload for file renamed events.
 */
export interface FileRenamedPayload {
  subscriptionId: string;
  oldPath: string;
  newPath: string;
}

// ============================================================================
// Module
// ============================================================================

export default {
  // ---------------------------------------------------------------------------
  // Read Operations
  //
  // These operations are lightweight - they NEVER create file watchers.
  // Use subscribe() explicitly if you need file change notifications.
  // ---------------------------------------------------------------------------

  /**
   * Read contents of a directory.
   *
   * @param dirPath - Absolute path to directory
   * @returns Array of directory entries
   */
  readDirectory: (dirPath: string) =>
    ipcRenderer.invoke("fs-v2:read-directory", {
      dirPath,
    }) as Promise<DirectoryEntry[]>,

  /**
   * Read file contents as binary data.
   *
   * @param filePath - Absolute path to file
   * @returns File contents as Uint8Array
   */
  readFile: (filePath: string) =>
    ipcRenderer.invoke("fs-v2:read-file", {
      filePath,
    }) as Promise<Uint8Array>,

  /**
   * Get file or directory metadata.
   *
   * @param path - Absolute path to file/directory
   * @returns File stats
   */
  stat: (path: string) =>
    ipcRenderer.invoke("fs-v2:stat", { path }) as Promise<FileStat>,

  /**
   * Check if a path exists.
   *
   * @param path - Absolute path to check
   * @returns true if path exists
   */
  exists: (path: string) =>
    ipcRenderer.invoke("fs-v2:exists", { path }) as Promise<boolean>,

  // ---------------------------------------------------------------------------
  // Write Operations
  //
  // These operations are lightweight - they NEVER create file watchers.
  // If you have an active subscription, the watcher will detect changes.
  // ---------------------------------------------------------------------------

  /**
   * Write content to a file.
   *
   * Creates the file if it doesn't exist.
   * Creates parent directories if they don't exist.
   *
   * @param filePath - Absolute path to file
   * @param content - File contents as Uint8Array
   */
  writeFile: (filePath: string, content: Uint8Array) =>
    ipcRenderer.invoke("fs-v2:write-file", {
      filePath,
      content,
    }) as Promise<void>,

  /**
   * Delete a file or directory.
   *
   * @param path - Absolute path to delete
   * @param options - Delete options (recursive for directories)
   */
  delete: (path: string, options?: DeleteOptions) =>
    ipcRenderer.invoke("fs-v2:delete", {
      path,
      options,
    }) as Promise<void>,

  /**
   * Rename or move a file/directory.
   *
   * @param oldPath - Current absolute path
   * @param newPath - New absolute path
   */
  rename: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke("fs-v2:rename", {
      oldPath,
      newPath,
    }) as Promise<void>,

  /**
   * Create a directory.
   *
   * Creates parent directories if they don't exist.
   *
   * @param dirPath - Absolute path to create
   */
  createDirectory: (dirPath: string) =>
    ipcRenderer.invoke("fs-v2:create-directory", {
      dirPath,
    }) as Promise<void>,

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to file system events.
   *
   * @param cwd - Working directory (provider scope)
   * @param type - Type of events to subscribe to
   * @param path - Optional path filter
   * @returns Subscription ID for unsubscribing
   */
  subscribe: (cwd: string, type: "directory" | "file" | "all", path?: string) =>
    ipcRenderer.invoke("fs-v2:subscribe", {
      cwd,
      type,
      path,
    }) as Promise<string>,

  /**
   * Unsubscribe from file system events.
   *
   * @param subscriptionId - ID returned from subscribe
   */
  unsubscribe: (subscriptionId: string) =>
    ipcRenderer.invoke("fs-v2:unsubscribe", {
      subscriptionId,
    }) as Promise<void>,

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  /**
   * Listen for directory listing changes.
   *
   * @param listener - Callback for directory listing changed events
   * @returns Cleanup function to stop listening
   */
  onDirectoryListingChanged: (
    listener: (payload: DirectoryListingChangedPayload) => void,
  ) =>
    createEventListener<DirectoryListingChangedPayload>(
      "fs-v2:directory-listing-changed",
      listener,
    ),

  /**
   * Listen for file content changes.
   *
   * @param listener - Callback for file content changed events
   * @returns Cleanup function to stop listening
   */
  onFileContentChanged: (
    listener: (payload: FileContentChangedPayload) => void,
  ) =>
    createEventListener<FileContentChangedPayload>(
      "fs-v2:file-content-changed",
      listener,
    ),

  /**
   * Listen for file deletions.
   *
   * @param listener - Callback for file deleted events
   * @returns Cleanup function to stop listening
   */
  onFileDeleted: (listener: (payload: FileDeletedPayload) => void) =>
    createEventListener<FileDeletedPayload>("fs-v2:file-deleted", listener),

  /**
   * Listen for file renames/moves.
   *
   * @param listener - Callback for file renamed events
   * @returns Cleanup function to stop listening
   */
  onFileRenamed: (listener: (payload: FileRenamedPayload) => void) =>
    createEventListener<FileRenamedPayload>("fs-v2:file-renamed", listener),
};
