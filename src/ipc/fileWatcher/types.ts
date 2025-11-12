import type { FSWatcher } from "chokidar";

/**
 * Represents a subscription to file watching for a specific pane in a window.
 */
export type FileWatcherSubscription = {
  paneId: string;
  windowId: number;
};

/**
 * Internal entry tracking a watcher and its subscribers for a specific directory.
 */
export type WatcherEntry = {
  fsWatcher: FSWatcher | null;
  subscribers: Set<FileWatcherSubscription>;
  gitRoot: string | null;
};

/**
 * Event payload for file change notifications.
 */
export type FileChangedEvent = {
  cwd: string;
  filePath: string;
  relativePath: string;
  eventType: "changed" | "deleted";
};

/**
 * Event payload for file rename notifications.
 */
export type FileRenamedEvent = {
  cwd: string;
  oldPath: string;
  newPath: string;
  oldRelativePath: string;
  newRelativePath: string;
};

/**
 * Event payload for file tree change notifications.
 */
export type TreeChangedEvent = {
  cwd: string;
};

/**
 * Metadata stored for recently deleted files to detect renames.
 */
export type UnlinkMetadata = {
  timestamp: number;
  size: number;
  mtimeMs: number;
};
