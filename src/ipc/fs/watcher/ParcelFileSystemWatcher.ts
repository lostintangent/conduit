import watcher, {
  AsyncSubscription,
  Event as ParcelEvent,
} from "@parcel/watcher";
import path from "node:path";
import fs from "node:fs";
import { BaseWatcher } from "./BaseWatcher";
import { RenameDetector } from "./RenameDetector";
import type { IFileSystemWatcher } from "./IFileSystemWatcher";
import type {
  FileChangedEvent,
  TreeChangedEvent,
  FileRenamedEvent,
} from "./types";

export class ParcelFileSystemWatcher
  extends BaseWatcher
  implements IFileSystemWatcher
{
  private subscription: AsyncSubscription | null = null;
  private watching = false;
  private realCwd: string;

  private fileChangedCallbacks: Array<(event: FileChangedEvent) => void> = [];
  private fileRenamedCallbacks: Array<(event: FileRenamedEvent) => void> = [];
  private treeChangedCallbacks: Array<(event: TreeChangedEvent) => void> = [];

  private renameDetector = new RenameDetector();

  constructor(
    private readonly cwd: string,
    private readonly options: {
      ignored?: string[];
    } = {},
  ) {
    super();
    // Resolve symlinks to get the real path for consistent path matching
    // This handles macOS /var -> /private/var symlink
    try {
      this.realCwd = fs.realpathSync(cwd);
    } catch {
      this.realCwd = path.resolve(cwd);
    }
  }

  async watch(): Promise<void> {
    if (this.watching) {
      console.warn(`[ParcelFS] Already watching ${this.cwd}`);
      return;
    }

    const backend = this.getBackend();
    console.log(
      `[ParcelFS] Starting watch on ${this.cwd} with backend: ${backend}`,
    );

    try {
      this.subscription = await watcher.subscribe(
        this.cwd,
        (err, events) => {
          if (err) {
            console.error(`[ParcelFS] Error in watcher for ${this.cwd}:`, err);
            return;
          }

          this.handleEvents(events);
        },
        {
          backend,
          ignore: this.options.ignored || [],
        },
      );

      this.watching = true;
      console.log(`[ParcelFS] Now watching ${this.cwd}`);
    } catch (error) {
      console.error(`[ParcelFS] Failed to start watching ${this.cwd}:`, error);
      throw error;
    }
  }

  async unwatch(): Promise<void> {
    if (!this.watching || !this.subscription) {
      return;
    }

    console.log(`[ParcelFS] Stopping watch on ${this.cwd}`);

    await this.subscription.unsubscribe();
    this.subscription = null;
    this.watching = false;

    this.clearDebounceTimers();
    this.renameDetector.clear();
  }

  onFileChanged(callback: (event: FileChangedEvent) => void): void {
    this.fileChangedCallbacks.push(callback);
  }

  onFileRenamed(callback: (event: FileRenamedEvent) => void): void {
    this.fileRenamedCallbacks.push(callback);
  }

  onTreeChanged(callback: (event: TreeChangedEvent) => void): void {
    this.treeChangedCallbacks.push(callback);
  }

  isWatching(): boolean {
    return this.watching;
  }

  getPath(): string {
    return this.cwd;
  }

  private getBackend(): "fs-events" | "inotify" | "windows" {
    if (process.platform === "darwin") return "fs-events";
    if (process.platform === "linux") return "inotify";
    return "windows";
  }

  private handleEvents(events: ParcelEvent[]): void {
    for (const event of events) {
      this.handleEvent(event);
    }
  }

  private handleEvent(event: ParcelEvent): void {
    const { type, path: filePath } = event;
    // Use realCwd for consistent path matching (handles symlinks like /var -> /private/var)
    const relativePath = path.relative(this.realCwd, filePath);

    switch (type) {
      case "create":
        this.handleCreate(filePath, relativePath);
        break;
      case "update":
        this.handleUpdate(filePath, relativePath);
        break;
      case "delete":
        this.handleDelete(filePath, relativePath);
        break;
    }
  }

  private handleCreate(filePath: string, relativePath: string): void {
    // First, check if this CREATE matches a recent DELETE (normal order)
    const renamedFrom = this.renameDetector.detectRenameFromCreate(filePath);

    if (renamedFrom) {
      // It's a rename! (DELETE came before CREATE)
      const oldRelativePath = path.relative(this.realCwd, renamedFrom);

      console.log(
        `[ParcelFS] Detected rename: ${oldRelativePath} → ${relativePath}`,
      );

      // Check if the renamed item is a directory
      let isDirectory = false;
      try {
        const stats = fs.statSync(filePath);
        isDirectory = stats.isDirectory();
      } catch (error) {
        // If we can't stat the file, fall back to checking the path
        console.error(`[ParcelFS] Failed to stat ${filePath}:`, error);
      }

      const renameEvent: FileRenamedEvent = {
        cwd: this.cwd,
        oldPath: renamedFrom,
        newPath: filePath,
        oldRelativePath,
        newRelativePath: relativePath,
        isDirectory,
      };

      for (const callback of this.fileRenamedCallbacks) {
        callback(renameEvent);
      }
    } else {
      // Not a rename yet - record this CREATE in case DELETE comes later
      this.renameDetector.recordCreate(filePath);

      // It's a true file addition (not a rename) - emit file-changed event
      this.debounce(`file-addition:${filePath}`, 50, () => {
        const event: FileChangedEvent = {
          cwd: this.cwd,
          filePath,
          relativePath,
          eventType: "added",
        };

        for (const callback of this.fileChangedCallbacks) {
          callback(event);
        }
      });
    }

    // Always trigger tree change for additions
    this.debounce(`tree-change`, 100, () => {
      const event: TreeChangedEvent = { cwd: this.cwd };
      for (const callback of this.treeChangedCallbacks) {
        callback(event);
      }
    });
  }

  private handleUpdate(filePath: string, relativePath: string): void {
    this.debounce(`file-change:${filePath}`, 50, () => {
      const event: FileChangedEvent = {
        cwd: this.cwd,
        filePath,
        relativePath,
        eventType: "changed",
      };

      for (const callback of this.fileChangedCallbacks) {
        callback(event);
      }
    });
  }

  private handleDelete(filePath: string, relativePath: string): void {
    // First, check if this DELETE matches a recent CREATE (reversed order)
    const renamedTo = this.renameDetector.detectRenameFromDelete(filePath);

    if (renamedTo) {
      // It's a rename! (CREATE came before DELETE)
      const newRelativePath = path.relative(this.realCwd, renamedTo);

      console.log(
        `[ParcelFS] Detected rename (reversed order): ${relativePath} → ${newRelativePath}`,
      );

      // Check if the renamed item is a directory
      let isDirectory = false;
      try {
        const stats = fs.statSync(renamedTo);
        isDirectory = stats.isDirectory();
      } catch (error) {
        // If we can't stat the file, fall back to checking the path
        console.error(`[ParcelFS] Failed to stat ${renamedTo}:`, error);
      }

      const renameEvent: FileRenamedEvent = {
        cwd: this.cwd,
        oldPath: filePath,
        newPath: renamedTo,
        oldRelativePath: relativePath,
        newRelativePath,
        isDirectory,
      };

      for (const callback of this.fileRenamedCallbacks) {
        callback(renameEvent);
      }

      // Don't emit delete event - it's a rename!
      // Still trigger tree change though
      this.debounce(`tree-change`, 100, () => {
        const event: TreeChangedEvent = { cwd: this.cwd };
        for (const callback of this.treeChangedCallbacks) {
          callback(event);
        }
      });
    } else {
      // Not a rename yet - record this DELETE in case CREATE comes later
      this.renameDetector.recordUnlink(filePath);

      // Debounce deletion to allow rename detection
      this.debounce(`file-deletion:${filePath}`, 200, () => {
        const event: FileChangedEvent = {
          cwd: this.cwd,
          filePath,
          relativePath,
          eventType: "deleted",
        };

        for (const callback of this.fileChangedCallbacks) {
          callback(event);
        }
      });

      // Trigger tree change
      this.debounce(`tree-change`, 100, () => {
        const event: TreeChangedEvent = { cwd: this.cwd };
        for (const callback of this.treeChangedCallbacks) {
          callback(event);
        }
      });
    }
  }
}
