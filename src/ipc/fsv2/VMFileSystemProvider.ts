/**
 * VMFileSystemProvider - Filesystem provider for cloud VM operations.
 *
 * This provider implements the FileSystemProvider interface for remote VMs,
 * routing all operations through the sandbox-ipc WebSocket connection to the
 * VM's sandbox-ipc-provider-go server.
 *
 * Architecture:
 * ```
 * VMFileSystemProvider
 * └── SandboxIPCClient (WebSocket to VM)
 *     └── sandbox-ipc-provider-go (in VM)
 *         └── Local filesystem in VM
 * ```
 *
 * Key differences from DiskFileSystemProvider:
 * 1. All operations are RPC calls over WebSocket
 * 2. File watching events come from the VM's watcher
 * 3. No local caching (VM server handles caching)
 */

import { EventEmitter } from "../../shared/EventEmitter";
import type { SandboxIPCClient } from "../vm/sandbox-ipc-client";
import type {
  DeleteOptions,
  DirectoryEntry,
  DirectoryListingChangedEvent,
  Event,
  FileContentChangedEvent,
  FileDeletedEvent,
  FileRenamedEvent,
  FileStat,
  FileSystemProvider,
} from "./types";

// ============================================================================
// Types matching sandbox-ipc-provider-go responses
// ============================================================================

interface VMDirectoryEntry {
  name: string;
  type: "file" | "directory";
}

interface VMFileStat {
  type: "file" | "directory";
  size: number;
  mtime: number;
  ctime: number;
  readonly?: boolean;
}

// ============================================================================
// VMFileSystemProvider
// ============================================================================

/**
 * Filesystem provider implementation for cloud VM operations.
 *
 * Routes all filesystem operations through the sandbox-ipc WebSocket
 * connection to the VM's sandbox-ipc-provider-go server.
 *
 * @example
 * ```typescript
 * const sandboxClient = await getSandboxClient(vmId);
 * const provider = new VMFileSystemProvider('/home/user/project', sandboxClient);
 *
 * // Read directory from VM
 * const entries = await provider.readDirectory('/home/user/project/src');
 *
 * // Subscribe to changes from VM
 * provider.onDirectoryListingChanged((event) => {
 *   console.log('Directory changed in VM:', event.path);
 * });
 * ```
 */
export class VMFileSystemProvider implements FileSystemProvider {
  readonly cwd: string;
  private disposed = false;
  private eventCleanups: Array<() => void> = [];

  // -------------------------------------------------------------------------
  // Event Emitters
  // -------------------------------------------------------------------------

  private readonly _onDirectoryListingChanged =
    new EventEmitter<DirectoryListingChangedEvent>();
  private readonly _onFileContentChanged =
    new EventEmitter<FileContentChangedEvent>();
  private readonly _onFileRenamed = new EventEmitter<FileRenamedEvent>();
  private readonly _onFileDeleted = new EventEmitter<FileDeletedEvent>();

  readonly onDirectoryListingChanged: Event<DirectoryListingChangedEvent> =
    this._onDirectoryListingChanged.event;
  readonly onFileContentChanged: Event<FileContentChangedEvent> =
    this._onFileContentChanged.event;
  readonly onFileRenamed: Event<FileRenamedEvent> = this._onFileRenamed.event;
  readonly onFileDeleted: Event<FileDeletedEvent> = this._onFileDeleted.event;

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  /**
   * Create a new VM filesystem provider.
   *
   * @param cwd - The working directory in the VM
   * @param sandboxClient - The sandbox-ipc WebSocket client for the VM
   */
  constructor(
    cwd: string,
    private readonly sandboxClient: SandboxIPCClient,
  ) {
    this.cwd = cwd;
    this.setupEventListeners();
  }

  // -------------------------------------------------------------------------
  // Event Setup
  // -------------------------------------------------------------------------

  /**
   * Set up listeners for file system events from the VM.
   */
  private setupEventListeners(): void {
    // Listen for directory changes from VM
    const unsubDirectoryChanged = this.sandboxClient.on(
      "directoryChanged",
      (data: unknown) => {
        const event = data as { path: string; entries: VMDirectoryEntry[] };
        this._onDirectoryListingChanged.fire({
          path: event.path,
          entries: event.entries,
        });
      },
    );
    this.eventCleanups.push(unsubDirectoryChanged);

    // Listen for file content changes from VM
    const unsubFileChanged = this.sandboxClient.on(
      "fileChanged",
      (data: unknown) => {
        const event = data as { path: string };
        this._onFileContentChanged.fire({ path: event.path });
      },
    );
    this.eventCleanups.push(unsubFileChanged);

    // Listen for file created events (also triggers directory change)
    const unsubFileCreated = this.sandboxClient.on(
      "fileCreated",
      (data: unknown) => {
        const event = data as { path: string };
        this._onFileContentChanged.fire({ path: event.path });
      },
    );
    this.eventCleanups.push(unsubFileCreated);

    // Listen for file deleted events from VM
    const unsubFileDeleted = this.sandboxClient.on(
      "fileDeleted",
      (data: unknown) => {
        const event = data as { path: string; isDirectory?: boolean };
        this._onFileDeleted.fire({
          path: event.path,
          isDirectory: event.isDirectory ?? false,
        });
      },
    );
    this.eventCleanups.push(unsubFileDeleted);

    // Listen for file renamed events from VM
    const unsubFileRenamed = this.sandboxClient.on(
      "fileRenamed",
      (data: unknown) => {
        const event = data as {
          oldPath: string;
          newPath: string;
          isDirectory?: boolean;
        };
        this._onFileRenamed.fire({
          oldPath: event.oldPath,
          newPath: event.newPath,
          isDirectory: event.isDirectory ?? false,
        });
      },
    );
    this.eventCleanups.push(unsubFileRenamed);
  }

  // -------------------------------------------------------------------------
  // File Operations
  // -------------------------------------------------------------------------

  /**
   * Get metadata for a file or directory in the VM.
   */
  async stat(path: string): Promise<FileStat> {
    this.ensureNotDisposed();

    // The sandbox-ipc server returns FileStat directly (not wrapped in {stat: ...})
    const result = await this.sandboxClient.call<VMFileStat>("fs.stat", {
      path,
    });

    // Handle case where sandbox-ipc returns an error or empty response
    if (!result || !result.type) {
      throw new Error(`No such file or directory: ${path}`);
    }

    return {
      type: result.type,
      size: result.size,
      mtime: result.mtime,
      ctime: result.ctime,
      readonly: result.readonly,
    };
  }

  /**
   * List contents of a directory in the VM.
   */
  async readDirectory(dirPath: string): Promise<DirectoryEntry[]> {
    this.ensureNotDisposed();

    const result = await this.sandboxClient.call<{
      entries: VMDirectoryEntry[];
    }>("fs.readDirectory", { path: dirPath });

    // Handle missing entries
    if (!result?.entries) {
      return [];
    }

    return result.entries;
  }

  /**
   * Read complete file contents from the VM.
   */
  async readFile(filePath: string): Promise<Uint8Array> {
    this.ensureNotDisposed();

    if (filePath.endsWith("/")) {
      throw new Error(`Cannot read file: ${filePath} is a directory`);
    }

    const result = await this.sandboxClient.call<{ content: string }>(
      "fs.readFile",
      { path: filePath },
    );

    // Content is base64 encoded
    return Buffer.from(result.content, "base64");
  }

  /**
   * Read complete file contents as text (UTF-8).
   *
   * Convenience method that returns a string directly, avoiding the need
   * for TextDecoder on the caller side.
   *
   * Note: Binary files will have invalid UTF-8 bytes replaced with U+FFFD.
   */
  async readTextFile(filePath: string): Promise<string> {
    this.ensureNotDisposed();

    if (filePath.endsWith("/")) {
      throw new Error(`Cannot read file: ${filePath} is a directory`);
    }

    const result = await this.sandboxClient.call<{ content: string }>(
      "fs.readFile",
      { path: filePath },
    );

    // Content is base64 encoded - decode to string
    return Buffer.from(result.content, "base64").toString("utf-8");
  }

  /**
   * Write content to a file in the VM.
   */
  async writeFile(filePath: string, content: Uint8Array): Promise<void> {
    this.ensureNotDisposed();

    await this.sandboxClient.call("fs.writeFile", {
      path: filePath,
      content: Buffer.from(content).toString("base64"),
    });
  }

  /**
   * Delete a file or directory in the VM.
   */
  async delete(path: string, options?: DeleteOptions): Promise<void> {
    this.ensureNotDisposed();

    await this.sandboxClient.call("fs.delete", {
      path,
      recursive: options?.recursive ?? false,
    });
  }

  /**
   * Rename or move a file/directory in the VM.
   */
  async rename(oldPath: string, newPath: string): Promise<void> {
    this.ensureNotDisposed();

    await this.sandboxClient.call("fs.rename", { oldPath, newPath });
  }

  /**
   * Create a directory in the VM.
   */
  async createDirectory(dirPath: string): Promise<void> {
    this.ensureNotDisposed();

    await this.sandboxClient.call("fs.createDirectory", { path: dirPath });
  }

  /**
   * Check if a path exists in the VM.
   */
  async exists(path: string): Promise<boolean> {
    this.ensureNotDisposed();

    try {
      const result = await this.sandboxClient.call<{ exists: boolean }>(
        "fs.exists",
        { path },
      );
      return result.exists;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Clean up resources.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    // Clean up event listeners
    for (const cleanup of this.eventCleanups) {
      cleanup();
    }
    this.eventCleanups = [];

    // Dispose emitters
    this._onDirectoryListingChanged.dispose();
    this._onFileContentChanged.dispose();
    this._onFileRenamed.dispose();
    this._onFileDeleted.dispose();
  }

  /**
   * Ensure the provider has not been disposed.
   */
  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error("VMFileSystemProvider has been disposed");
    }
  }
}
