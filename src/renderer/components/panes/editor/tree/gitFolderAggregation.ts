import type { GitStatusMap, GitFileStatus } from "@shared/types";
import { getStatusConfig } from "./GitStatusBadge";

/**
 * Aggregates git status for a folder based on its child files.
 * Follows VS Code's folder decoration logic:
 * - Collects statuses from child files
 * - Filters out deleted files (they don't propagate to parent folders)
 * - Sorts by weight (priority): conflict=4, added/deleted=3, modified=2, untracked=1
 * - Returns the highest-weight status config
 *
 * Reference: VSCODE_GIT_STATUS_MAPPING.md - Folder Decoration Logic
 *
 * @param gitStatus - Map of relative paths to git status
 * @param folderRelativePath - The folder's relative path
 * @returns The aggregated status config, or null if no changes
 */
export function aggregateFolderStatus(
  gitStatus: GitStatusMap | null | undefined,
  folderRelativePath: string,
): ReturnType<typeof getStatusConfig> {
  if (!gitStatus || gitStatus.size === 0) return null;

  // Normalize folder path: remove trailing slash if present
  const normalizedFolder = folderRelativePath.endsWith("/")
    ? folderRelativePath.slice(0, -1)
    : folderRelativePath;

  // Collect all child file statuses under this folder
  const childStatuses: GitFileStatus[] = [];

  // For root folder (empty string), match all files
  // For other folders, match files that start with "folder/"
  const folderPrefix = normalizedFolder === "" ? "" : normalizedFolder + "/";

  for (const [relativePath, status] of gitStatus) {
    // Check if this file is under the folder
    const isUnderFolder =
      normalizedFolder === ""
        ? true // Root folder matches all files
        : relativePath.startsWith(folderPrefix) ||
          relativePath === normalizedFolder;

    if (isUnderFolder) {
      // Filter out deleted files - they don't propagate to parent folders
      // Reference: VSCODE_GIT_STATUS_MAPPING.md line 132
      if (status.status !== "deleted") {
        childStatuses.push(status);
      }
    }
  }

  // If no child statuses, return null
  if (childStatuses.length === 0) return null;

  // Get status configs for all child files
  const configs = childStatuses
    .map((status) => getStatusConfig(status))
    .filter((config) => config !== null);

  if (configs.length === 0) return null;

  // Sort by weight (highest priority first)
  // Reference: VSCODE_GIT_STATUS_MAPPING.md lines 211-215
  configs.sort((a, b) => b.weight - a.weight);

  // Return the highest-weight status config
  return configs[0];
}
