/**
 * Protocol types shared between client and VM agent
 * This is duplicated from the main codebase to keep the agent standalone
 */

export type FSRequest =
  | ReadFileRequest
  | WriteFileRequest
  | DeleteFileRequest
  | FileExistsRequest
  | FileStatsRequest
  | ListDirectoryRequest
  | WatchDirectoryRequest
  | UnwatchDirectoryRequest
  | PingRequest
  | GitStatusRequest
  | GitBranchesRequest
  | GitDiffRequest
  | GitDiffStatsRequest
  | GitMostRecentFileRequest
  | GitRepoRootRequest
  | GitStageRequest
  | GitUnstageRequest
  | GitRevertRequest;

export type ReadFileRequest = {
  type: "read-file";
  id: string;
  path: string;
};

export type WriteFileRequest = {
  type: "write-file";
  id: string;
  path: string;
  content: string;
};

export type DeleteFileRequest = {
  type: "delete-file";
  id: string;
  path: string;
};

export type FileExistsRequest = {
  type: "file-exists";
  id: string;
  path: string;
};

export type FileStatsRequest = {
  type: "file-stats";
  id: string;
  path: string;
};

export type ListDirectoryRequest = {
  type: "list-directory";
  id: string;
  path: string;
  rootPath?: string;
};

export type WatchDirectoryRequest = {
  type: "watch-directory";
  id: string;
  path: string;
  ignored?: string[];
};

export type UnwatchDirectoryRequest = {
  type: "unwatch-directory";
  id: string;
  path: string;
};

export type PingRequest = {
  type: "ping";
  id: string;
};

export type GitStatusRequest = {
  type: "git-status";
  id: string;
  cwd: string;
  baseBranch?: string | null;
};

export type GitBranchesRequest = {
  type: "git-branches";
  id: string;
  cwd: string;
};

export type GitDiffRequest = {
  type: "git-diff";
  id: string;
  cwd: string;
  filePath: string;
  baseBranch?: string | null;
};

export type GitDiffStatsRequest = {
  type: "git-diff-stats";
  id: string;
  cwd: string;
};

export type GitMostRecentFileRequest = {
  type: "git-most-recent-file";
  id: string;
  cwd: string;
};

export type GitRepoRootRequest = {
  type: "git-repo-root";
  id: string;
  cwd: string;
};

export type GitStageRequest = {
  type: "git-stage";
  id: string;
  cwd: string;
  files: string[];
};

export type GitUnstageRequest = {
  type: "git-unstage";
  id: string;
  cwd: string;
  files: string[];
};

export type GitRevertRequest = {
  type: "git-revert";
  id: string;
  cwd: string;
  files: string[];
};

export type FSResponse =
  | SuccessResponse
  | ErrorResponse
  | FileChangedEvent
  | FileRenamedEvent
  | TreeChangedEvent
  | PongResponse;

export type SuccessResponse = {
  type: "response";
  id: string;
  data: unknown;
};

export type ErrorResponse = {
  type: "error";
  id: string;
  error: string;
  code?: string;
};

export type FileChangedEvent = {
  type: "file-changed";
  cwd: string;
  filePath: string;
  relativePath: string;
  eventType: "added" | "changed" | "deleted";
};

export type FileRenamedEvent = {
  type: "file-renamed";
  cwd: string;
  oldPath: string;
  newPath: string;
  oldRelativePath: string;
  newRelativePath: string;
  isDirectory: boolean;
};

export type TreeChangedEvent = {
  type: "tree-changed";
  cwd: string;
};

export type PongResponse = {
  type: "pong";
  id: string;
  timestamp: number;
};
