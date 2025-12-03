export type FileTreeNode = {
  name: string;
  path: string;
  relativePath: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
};

/**
 * File statistics
 */
export type FileStats = {
  mtime: number; // Modification time in milliseconds since epoch
  size: number; // File size in bytes
  isFile: boolean;
  isDirectory: boolean;
};

/**
 * Git file status for a single file
 */
export type GitFileStatus = {
  status:
    | "modified"
    | "added"
    | "deleted"
    | "renamed"
    | "copied"
    | "untracked"
    | "unmodified"
    | "conflict"
    | "type-changed"
    | "ignored";
  staged: boolean;
  relativePath: string;

  // Optional separate staging statuses to handle cases like "AD" (added in index, deleted in working tree)
  stagedStatus?: "modified" | "added" | "deleted" | "renamed" | "copied";
  unstagedStatus?: "modified" | "added" | "deleted" | "untracked";
};

/**
 * Map of relative file paths to their git status
 */
export type GitStatusMap = Map<string, GitFileStatus>;

/**
 * Information about a git branch
 */
export type Branch = {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  lastCommitDate: Date;
  lastCommitHash: string;
  lastCommitMessage: string;
};

/**
 * Result of getting a file diff
 */
export type FileDiffResult = {
  originalContent: string;
  modifiedContent: string;
  status: "modified" | "added" | "deleted" | "binary";
  isBinary: boolean;
};

/* File watcher event payloads */

export type FileChangedEvent = {
  cwd: string;
  filePath: string;
  relativePath: string;
  eventType: "changed" | "deleted";
};

export type TreeChangedEvent = {
  cwd: string;
};

export type FileRenamedEvent = {
  cwd: string;
  oldPath: string;
  newPath: string;
  oldRelativePath: string;
  newRelativePath: string;
  isDirectory: boolean;
};
