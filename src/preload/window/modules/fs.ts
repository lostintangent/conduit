/**
 * FileSystem v2 Preload Module
 *
 * Exposes the filesystem provider v2 IPC channels to the renderer process.
 * This module provides low-level access to filesystem operations. For a
 * higher-level API with subscription management, use the FileSystemV2API
 * class in the renderer.
 *
 * @see src/features/files/client/FileSystemV2API.ts
 * @see src/features/files/main/handlers.ts
 */

import { ipcRenderer } from "electron";
import type {
  DeleteOptions,
  DirectoryEntry,
  FileStat,
} from "@features/files/model";
import { createEventListener } from "../utils";

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
   * @param cwd - Working directory (provider scope)
   * @param dirPath - Absolute path to directory
   * @returns Array of directory entries
   */
  readDirectory: (cwd: string, dirPath: string) =>
    ipcRenderer.invoke("fs-v2:read-directory", {
      cwd,
      dirPath,
    }) as Promise<DirectoryEntry[]>,

  /**
   * Read file contents as binary data.
   *
   * @param cwd - Working directory (provider scope)
   * @param filePath - Absolute path to file
   * @returns File contents as Uint8Array
   */
  readFile: (cwd: string, filePath: string) =>
    ipcRenderer.invoke("fs-v2:read-file", {
      cwd,
      filePath,
    }) as Promise<Uint8Array>,

  /**
   * Read file contents as text (UTF-8 string).
   * More efficient than readFile for text files because string
   * serialization over IPC is faster than Uint8Array.
   *
   * @param cwd - Working directory (provider scope)
   * @param filePath - Absolute path to file
   * @returns File contents as string
   */
  readTextFile: (cwd: string, filePath: string) =>
    ipcRenderer.invoke("fs-v2:read-text-file", {
      cwd,
      filePath,
    }) as Promise<string>,

  /**
   * Get file or directory metadata.
   *
   * @param cwd - Working directory (provider scope)
   * @param path - Absolute path to file/directory
   * @returns File stats
   */
  stat: (cwd: string, path: string) =>
    ipcRenderer.invoke("fs-v2:stat", { cwd, path }) as Promise<FileStat>,

  /**
   * Check if a path exists.
   *
   * @param cwd - Working directory (provider scope)
   * @param path - Absolute path to check
   * @returns true if path exists
   */
  exists: (cwd: string, path: string) =>
    ipcRenderer.invoke("fs-v2:exists", { cwd, path }) as Promise<boolean>,

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
   * @param cwd - Working directory (provider scope)
   * @param filePath - Absolute path to file
   * @param content - File contents as Uint8Array
   */
  writeFile: (cwd: string, filePath: string, content: Uint8Array) =>
    ipcRenderer.invoke("fs-v2:write-file", {
      cwd,
      filePath,
      content,
    }) as Promise<void>,

  /**
   * Delete a file or directory.
   *
   * @param cwd - Working directory (provider scope)
   * @param path - Absolute path to delete
   * @param options - Delete options (recursive for directories)
   */
  delete: (cwd: string, path: string, options?: DeleteOptions) =>
    ipcRenderer.invoke("fs-v2:delete", {
      cwd,
      path,
      options,
    }) as Promise<void>,

  /**
   * Rename or move a file/directory.
   *
   * @param cwd - Working directory (provider scope)
   * @param oldPath - Current absolute path
   * @param newPath - New absolute path
   */
  rename: (cwd: string, oldPath: string, newPath: string) =>
    ipcRenderer.invoke("fs-v2:rename", {
      cwd,
      oldPath,
      newPath,
    }) as Promise<void>,

  /**
   * Create a directory.
   *
   * Creates parent directories if they don't exist.
   *
   * @param cwd - Working directory (provider scope)
   * @param dirPath - Absolute path to create
   */
  createDirectory: (cwd: string, dirPath: string) =>
    ipcRenderer.invoke("fs-v2:create-directory", {
      cwd,
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

  // ---------------------------------------------------------------------------
  // Quick Open Cache
  // ---------------------------------------------------------------------------

  /**
   * Trigger pre-warming of file cache for quick open.
   *
   * This scans the workspace directory in the background and caches
   * all file paths for instant quick open results.
   *
   * @param workspaceRoot - Absolute path to workspace root
   */
  warmFileCache: (workspaceRoot: string) =>
    ipcRenderer.invoke("fs:warm-file-cache", workspaceRoot),

  /**
   * Get the pre-warmed file cache if available.
   *
   * Returns cached file list with validity status.
   *
   * @param workspaceRoot - Absolute path to workspace root
   * @returns Cached file data or null if not available
   */
  getPreWarmedCache: (workspaceRoot: string) =>
    ipcRenderer.invoke("fs:get-pre-warmed-cache", workspaceRoot),
};
