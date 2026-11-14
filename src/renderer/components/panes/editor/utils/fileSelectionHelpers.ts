/**
 * File selection helpers for editor v2.
 *
 * Provides utilities for selecting the next available file when the
 * current file is no longer available (deleted, reverted, etc.).
 */

import type { FileNode } from "../types";

/**
 * Options for selecting the next file.
 */
export interface SelectNextFileOptions {
  /** Whether to fall back to recently committed files if no dirty files exist */
  fallbackToCommitted?: boolean;
  /** Number of commits to search when falling back to committed files */
  commitLimit?: number;
}

/**
 * Result of selecting the next file.
 */
export interface SelectNextFileResult {
  /** The selected file node, or null if no file available */
  file: FileNode | null;
  /** The relative path of the file (for git operations) */
  relativePath: string | null;
}

/**
 * Select the next available file based on git history.
 *
 * Tries dirty files first (most recently modified uncommitted changes),
 * then optionally falls back to recently committed files.
 *
 * @param cwd - Current working directory
 * @param options - Selection options
 * @returns Promise with the selected file or null
 */
export async function selectNextAvailableFile(
  cwd: string,
  options: SelectNextFileOptions = {},
): Promise<SelectNextFileResult> {
  const { fallbackToCommitted = true, commitLimit = 10 } = options;

  // Try dirty files first (most recently modified uncommitted changes)
  let relativePath = await window.conduit.git.getMostRecentDirtyFile(cwd);

  // Fall back to recently committed files if enabled
  if (!relativePath && fallbackToCommitted) {
    relativePath = await window.conduit.git.getMostRecentCommittedFile(
      cwd,
      commitLimit,
    );
  }

  if (!relativePath) {
    return { file: null, relativePath: null };
  }

  // Convert relative path to FileNode
  const file = relativePathToFileNode(relativePath, cwd);

  return { file, relativePath };
}

/**
 * Convert a relative path to a FileNode.
 *
 * @param relativePath - Path relative to cwd
 * @param cwd - Current working directory
 * @returns FileNode for the path
 */
export function relativePathToFileNode(
  relativePath: string,
  cwd: string,
): FileNode {
  const fullPath = cwd.endsWith("/")
    ? `${cwd}${relativePath}`
    : `${cwd}/${relativePath}`;
  const name = relativePath.split("/").pop() ?? relativePath;

  return {
    path: fullPath,
    name,
    type: "file",
  };
}
