/**
 * Renderer API Module
 *
 * High-level APIs for renderer processes to interact with main process services.
 * These classes provide type-safe, managed access to filesystem and git operations.
 *
 * @example
 * ```typescript
 * import { FileSystemV2API, GitV2API } from '@/renderer/api';
 *
 * const fs = new FileSystemV2API('/path/to/project');
 * const git = new GitV2API('/path/to/project');
 *
 * // Use the APIs...
 *
 * // Clean up when done
 * fs.release();
 * git.release();
 * ```
 */

export { FileSystemV2API } from "./FileSystemV2API";
export type {
  DirectoryChangedCallback,
  FileChangedCallback,
  FileDeletedCallback,
  FileRenamedCallback,
  Cleanup as FileSystemCleanup,
} from "./FileSystemV2API";

export { GitV2API } from "./GitV2API";
export type {
  StatusChangedCallback,
  BranchChangedCallback,
  CommitCreatedCallback,
  HeadChangedCallback,
  Cleanup as GitCleanup,
} from "./GitV2API";
