import type { GitStatusMap } from "@shared/types";

/**
 * Represents a subscription to file watching for a specific pane in a window.
 */
export type FileWatcherSubscription = {
  paneId: string;
  windowId: number;
};

/**
 * Event payload for file change notifications.
 */
export type FileChangedEvent = {
  cwd: string;
  filePath: string;
  relativePath: string;
  eventType: "added" | "changed" | "deleted";
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
  isDirectory: boolean;
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
