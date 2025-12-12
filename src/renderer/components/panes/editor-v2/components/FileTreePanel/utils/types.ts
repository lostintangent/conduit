/**
 * Shared types for FileTreePanel components.
 */

import type { GitFileStatus } from "@/../../src/ipc/gitv2/types";

/** Represents a selectable item (file or folder) in the tree */
export interface SelectableItem {
  /** Path relative to cwd */
  path: string;
  /** Whether this is a folder or file */
  type: "file" | "folder";
}

/** A file entry with its status */
export interface FileEntry {
  path: string;
  name: string;
  status: GitFileStatus;
}

/** A folder node in the nested tree */
export interface FolderNode {
  name: string;
  path: string;
  files: FileEntry[];
  folders: Map<string, FolderNode>;
}
