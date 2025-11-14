import type {
  FileChangedEvent,
  TreeChangedEvent,
  FileRenamedEvent,
} from "./types";

export interface IFileSystemWatcher {
  /**
   * Start watching a directory
   */
  watch(): Promise<void>;

  /**
   * Stop watching and cleanup
   */
  unwatch(): Promise<void>;

  /**
   * Subscribe to file change events
   */
  onFileChanged(callback: (event: FileChangedEvent) => void): void;

  /**
   * Subscribe to file rename events
   */
  onFileRenamed(callback: (event: FileRenamedEvent) => void): void;

  /**
   * Subscribe to tree change events
   */
  onTreeChanged(callback: (event: TreeChangedEvent) => void): void;

  /**
   * Check if watcher is active
   */
  isWatching(): boolean;

  /**
   * Get watched directory path
   */
  getPath(): string;
}
