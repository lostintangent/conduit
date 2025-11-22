import watcher, {
  AsyncSubscription,
  Event as ParcelEvent,
} from "@parcel/watcher";
import fs from "node:fs";
import path from "node:path";
import type {
  FileChangedEvent,
  FileRenamedEvent,
  TreeChangedEvent,
} from "./protocol.js";

type WatchEventCallback = (
  event: FileChangedEvent | FileRenamedEvent | TreeChangedEvent,
) => void;

class RenameDetector {
  private deletedFiles = new Map<
    string,
    { inode: number; size: number; timestamp: number }
  >();
  private readonly timeWindow = 1000; // 1 second window for rename detection

  recordUnlink(filePath: string): void {
    try {
      const stats = fs.statSync(filePath);
      this.deletedFiles.set(filePath, {
        inode: stats.ino,
        size: stats.size,
        timestamp: Date.now(),
      });

      // Clean up old entries
      setTimeout(() => {
        this.deletedFiles.delete(filePath);
      }, this.timeWindow);
    } catch {
      // File already deleted, can't get stats
    }
  }

  detectRename(newFilePath: string): string | null {
    try {
      const newStats = fs.statSync(newFilePath);
      const now = Date.now();

      for (const [oldPath, metadata] of this.deletedFiles.entries()) {
        if (
          metadata.inode === newStats.ino &&
          metadata.size === newStats.size &&
          now - metadata.timestamp < this.timeWindow
        ) {
          this.deletedFiles.delete(oldPath);
          return oldPath;
        }
      }
    } catch {
      // Can't stat new file
    }

    return null;
  }

  clear(): void {
    this.deletedFiles.clear();
  }
}

export class DirectoryWatcher {
  private subscription: AsyncSubscription | null = null;
  private watching = false;
  private realCwd: string;
  private renameDetector = new RenameDetector();
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly cwd: string,
    private readonly onEvent: WatchEventCallback,
    private readonly options: { ignored?: string[] } = {},
  ) {
    // Resolve symlinks for consistent path matching
    try {
      this.realCwd = fs.realpathSync(cwd);
    } catch {
      this.realCwd = path.resolve(cwd);
    }
  }

  async watch(): Promise<void> {
    if (this.watching) {
      console.warn(`[Watcher] Already watching ${this.cwd}`);
      return;
    }

    console.log(`[Watcher] Starting watch on ${this.cwd}`);

    const backend = this.getBackend();

    this.subscription = await watcher.subscribe(
      this.cwd,
      (err, events) => {
        if (err) {
          console.error(`[Watcher] Error for ${this.cwd}:`, err);
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
    console.log(`[Watcher] Now watching ${this.cwd}`);
  }

  async unwatch(): Promise<void> {
    if (!this.watching || !this.subscription) {
      return;
    }

    console.log(`[Watcher] Stopping watch on ${this.cwd}`);

    await this.subscription.unsubscribe();
    this.subscription = null;
    this.watching = false;
    this.clearDebounceTimers();
    this.renameDetector.clear();
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
    const relativePath = path.relative(this.realCwd, filePath);

    console.log(`[Watcher] ${type.toUpperCase()}: ${relativePath}`);

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
    const renamedFrom = this.renameDetector.detectRename(filePath);

    if (renamedFrom) {
      const oldRelativePath = path.relative(this.realCwd, renamedFrom);

      let isDirectory = false;
      try {
        const stats = fs.statSync(filePath);
        isDirectory = stats.isDirectory();
      } catch (error) {
        console.error(`[Watcher] Failed to stat ${filePath}:`, error);
      }

      const renameEvent: FileRenamedEvent = {
        type: "file-renamed",
        cwd: this.cwd,
        oldPath: renamedFrom,
        newPath: filePath,
        oldRelativePath,
        newRelativePath: relativePath,
        isDirectory,
      };

      this.onEvent(renameEvent);
    } else {
      this.debounce(`file-addition:${filePath}`, 50, () => {
        const event: FileChangedEvent = {
          type: "file-changed",
          cwd: this.cwd,
          filePath,
          relativePath,
          eventType: "added",
        };
        this.onEvent(event);
      });
    }

    this.debounce(`tree-change`, 100, () => {
      const event: TreeChangedEvent = {
        type: "tree-changed",
        cwd: this.cwd,
      };
      this.onEvent(event);
    });
  }

  private handleUpdate(filePath: string, relativePath: string): void {
    this.debounce(`file-change:${filePath}`, 50, () => {
      const event: FileChangedEvent = {
        type: "file-changed",
        cwd: this.cwd,
        filePath,
        relativePath,
        eventType: "changed",
      };
      this.onEvent(event);
    });
  }

  private handleDelete(filePath: string, relativePath: string): void {
    this.renameDetector.recordUnlink(filePath);

    this.debounce(`file-deletion:${filePath}`, 200, () => {
      const event: FileChangedEvent = {
        type: "file-changed",
        cwd: this.cwd,
        filePath,
        relativePath,
        eventType: "deleted",
      };
      this.onEvent(event);
    });

    this.debounce(`tree-change`, 100, () => {
      const event: TreeChangedEvent = {
        type: "tree-changed",
        cwd: this.cwd,
      };
      this.onEvent(event);
    });
  }

  private debounce(key: string, delay: number, callback: () => void): void {
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      callback();
      this.debounceTimers.delete(key);
    }, delay);

    this.debounceTimers.set(key, timer);
  }

  private clearDebounceTimers(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
