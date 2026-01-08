/**
 * Git folder status aggregation logic.
 *
 * Follows VS Code's folder decoration logic to aggregate git status
 * from child files and determine the folder's overall status.
 */

import type { GitFileStatus } from "@/api/GitV2API";
import { getStatusConfig, type StatusConfig } from "./GitBadge";

/**
 * Aggregates git status for a folder based on its child files.
 * Follows VS Code's folder decoration logic:
 * - Collects statuses from child files
 * - Filters out deleted files (they don't propagate to parent folders)
 * - Sorts by weight (priority): conflict=4, added/deleted=3, modified=2, untracked=1
 * - Returns the highest-weight status config
 *
 * @param gitStatusMap - Map of relative paths to git status
 * @param folderRelativePath - The folder's relative path
 * @returns The aggregated status config, or null if no changes
 */
export function aggregateFolderStatus(
  gitStatusMap: Map<string, GitFileStatus> | null | undefined,
  folderRelativePath: string,
): StatusConfig | null {
  if (!gitStatusMap || gitStatusMap.size === 0) return null;

  // Normalize folder path: remove trailing slash if present
  const normalizedFolder = folderRelativePath.endsWith("/")
    ? folderRelativePath.slice(0, -1)
    : folderRelativePath;

  // Collect all child file statuses under this folder
  const childStatuses: GitFileStatus[] = [];

  // For root folder (empty string), match all files
  // For other folders, match files that start with "folder/"
  const folderPrefix = normalizedFolder === "" ? "" : normalizedFolder + "/";

  for (const [relativePath, status] of gitStatusMap) {
    // Check if this file is under the folder
    const isUnderFolder =
      normalizedFolder === ""
        ? true // Root folder matches all files
        : relativePath.startsWith(folderPrefix) ||
          relativePath === normalizedFolder;

    if (isUnderFolder) {
      // Filter out deleted files - they don't propagate to parent folders
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
    .filter((config): config is StatusConfig => config !== null);

  if (configs.length === 0) return null;

  // Sort by weight (highest priority first)
  configs.sort((a, b) => b.weight - a.weight);

  // Return the highest-weight status config
  return configs[0];
}
