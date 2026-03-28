/**
 * Shared types for FileTreePanel components.
 */

import type { GitFileStatus } from "@/api/GitV2API";

/** Represents a selectable item (file or folder) in the tree */
export interface SelectableItem {
  /** Path relative to cwd */
  path: string;
  /** Whether this is a folder or file */
  type: "file" | "folder";
}

/** A file entry with its status */
export interface FileEntry {
  /**
   * Map key used for tracking in the git status Map.
   * For partially staged files, this may include a suffix (e.g., "foo.ts\0unstaged").
   * Use this for multi-select tracking and React keys.
   */
  mapKey: string;

  /**
   * Actual file path (from status.path).
   * Use this for display, file operations, and git commands.
   */
  path: string;

  /** File name (last segment of path) */
  name: string;

  /** Git status information */
  status: GitFileStatus;
}

/** A folder node in the nested tree */
export interface FolderNode {
  name: string;
  path: string;
  files: FileEntry[];
  folders: Map<string, FolderNode>;
}
