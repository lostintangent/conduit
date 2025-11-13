import type { FSWatcher } from "chokidar";
import type { GitStatusMap } from "@shared/types";

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
  gitWatcher: FSWatcher | null;
  subscribers: Set<FileWatcherSubscription>;
  gitRoot: string | null;
  gitStatus: GitStatusMap | null;
  baseBranch: string | null;
  branches: any[] | null; // Cached branch list
  gitStatusFullDebounceTimer: NodeJS.Timeout | null;
  gitStatusFileDebounceTimers: Map<string, NodeJS.Timeout>;
  setupInProgress: boolean; // Track if watcher setup is currently running
  pendingGitStatusFiles: Set<string>; // Buffer for batching git status updates
  gitStatusBatchTimer: NodeJS.Timeout | null; // Timer for batch window
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
 * Event payload for git status change notifications.
 */
export type GitStatusChangedEvent = {
  cwd: string;
  gitStatus: GitStatusMap | null;
  baseBranch: string | null;
};

/**
 * Metadata stored for recently deleted files to detect renames.
 */
export type UnlinkMetadata = {
  timestamp: number;
  size: number;
  mtimeMs: number;
};
