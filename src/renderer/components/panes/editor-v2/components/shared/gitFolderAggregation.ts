/**
 * Git folder status aggregation logic.
 *
 * Follows VS Code's folder decoration logic to aggregate git status
 * from child files and determine the folder's overall status.
 */

import type { GitFileStatus } from "@/../../src/ipc/gitv2/types";
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

  // For root folder (empty string), match all files
  // For other folders, match files that start with "folder/"
  const folderPrefix = normalizedFolder === "" ? "" : normalizedFolder + "/";

  // Track the highest-weight status config found
  // This avoids collecting all configs and then sorting
  let maxConfig: StatusConfig | null = null;
  let maxWeight = -1;

  for (const [relativePath, status] of gitStatusMap) {
    // Early exit optimization: skip if path can't be under this folder
    if (normalizedFolder !== "") {
      // For non-root folders, path must start with prefix or match exactly
      if (
        !relativePath.startsWith(folderPrefix) &&
        relativePath !== normalizedFolder
      ) {
        continue;
      }
    }

    // Filter out deleted files - they don't propagate to parent folders
    if (status.status === "deleted") {
      continue;
    }

    // Get status config for this file
    const config = getStatusConfig(status);
    if (config && config.weight > maxWeight) {
      maxConfig = config;
      maxWeight = config.weight;

      // Early exit: if we found max possible weight (conflict=4), no need to continue
      if (maxWeight === 4) {
        break;
      }
    }
  }

  return maxConfig;
}
