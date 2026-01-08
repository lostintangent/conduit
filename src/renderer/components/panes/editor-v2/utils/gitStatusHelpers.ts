/**
 * Git status helpers for editor v2.
 *
 * These utilities handle the complexity of partially staged files,
 * where the same file can appear twice in the git status map:
 * - Staged entry: key is the file path
 * - Unstaged entry: key is the file path + UNSTAGED_KEY_SUFFIX
 *
 * Key concepts:
 * - MapKey: The key used in the git status Map (may include UNSTAGED_KEY_SUFFIX)
 * - FilePath: The actual file system path (never includes suffix)
 *
 * Use the branded types (MapKey, FilePath) from types.ts for type safety.
 */

import type { GitFileStatus } from "@/api/GitV2API";
import { type MapKey, type FilePath, asMapKey, asFilePath } from "../types";

// ============================================================================
// Constants
// ============================================================================

/**
 * Suffix used to distinguish unstaged entries of partially staged files
 * in the git status Map.
 *
 * This suffix is appended to file paths to create unique MapKeys for
 * unstaged entries when a file has both staged and unstaged changes.
 */
export const UNSTAGED_KEY_SUFFIX = "\0unstaged";

// ============================================================================
// MapKey Helpers - Centralized operations for MapKey <-> FilePath conversion
// ============================================================================

/**
 * Create a MapKey from a file path and staged boolean.
 *
 * For partially staged files:
 * - staged=true returns the path as-is (staged entry)
 * - staged=false returns path + UNSTAGED_KEY_SUFFIX (unstaged entry)
 *
 * @param path - The file's relative path
 * @param staged - Whether this is the staged (true) or unstaged (false) entry
 */
export function makeMapKey(path: string, staged: boolean): MapKey {
  return asMapKey(staged ? path : path + UNSTAGED_KEY_SUFFIX);
}

/**
 * Parse a MapKey into its component parts.
 *
 * @returns Object with path (FilePath) and staged (boolean)
 */
export function parseMapKey(mapKey: MapKey | string): {
  path: FilePath;
  staged: boolean;
} {
  if (mapKey.endsWith(UNSTAGED_KEY_SUFFIX)) {
    return {
      path: asFilePath(mapKey.slice(0, -UNSTAGED_KEY_SUFFIX.length)),
      staged: false,
    };
  }
  return {
    path: asFilePath(mapKey),
    staged: true,
  };
}

/**
 * Extract the file path from a MapKey, stripping any suffix.
 *
 * Use this when you need the actual file path for git operations,
 * file system access, or display purposes.
 */
export function mapKeyToPath(mapKey: MapKey | string): FilePath {
  return parseMapKey(mapKey).path;
}

/**
 * Check if a MapKey represents an unstaged entry.
 */
export function isUnstagedMapKey(mapKey: MapKey | string): boolean {
  return mapKey.endsWith(UNSTAGED_KEY_SUFFIX);
}

/**
 * Normalize a MapKey to match what exists in the given list of MapKeys.
 *
 * This handles the case where:
 * - Parent passes a MapKey with suffix (e.g., "file.ts\0unstaged")
 * - But the file is no longer partially staged, so only "file.ts" exists in the list
 *
 * @param mapKey - The MapKey to normalize
 * @param allMapKeys - List of all valid MapKeys in the current state
 * @returns The normalized MapKey, or the original if no normalization needed
 */
export function normalizeMapKey(
  mapKey: MapKey | string,
  allMapKeys: readonly string[],
): MapKey {
  // Direct match - MapKey exists in the list
  if (allMapKeys.includes(mapKey)) {
    return asMapKey(mapKey);
  }

  // If MapKey has suffix but the file isn't partially staged,
  // try without suffix
  if (mapKey.endsWith(UNSTAGED_KEY_SUFFIX)) {
    const pathWithoutSuffix = mapKey.slice(0, -UNSTAGED_KEY_SUFFIX.length);
    if (allMapKeys.includes(pathWithoutSuffix)) {
      return asMapKey(pathWithoutSuffix);
    }
  }

  // Return original (may not exist in list - caller should handle)
  return asMapKey(mapKey);
}

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Get the relative path from an absolute path and cwd.
 */
export function getRelativePath(absolutePath: string, cwd: string): string {
  if (absolutePath.startsWith(cwd)) {
    return absolutePath.slice(cwd.length).replace(/^\//, "");
  }
  return absolutePath;
}

/**
 * Look up a file's git status, handling partially staged files correctly.
 *
 * For partially staged files:
 * - When staged === false, looks up the unstaged entry (with suffix)
 * - When staged === true or undefined, looks up the base entry
 *
 * @param gitStatus - The git status map
 * @param relativePath - The file's relative path
 * @param staged - Whether to look up staged (true/undefined) or unstaged (false) entry
 */
export function getFileStatusForEntry(
  gitStatus: Map<string, GitFileStatus> | null | undefined,
  relativePath: string,
  staged?: boolean,
): GitFileStatus | undefined {
  if (!gitStatus) return undefined;

  if (staged === false) {
    // For unstaged entry, try lookup with suffix first, fallback to base path
    return (
      gitStatus.get(relativePath + UNSTAGED_KEY_SUFFIX) ??
      gitStatus.get(relativePath)
    );
  }
  // For staged entry or normal mode, use base path
  return gitStatus.get(relativePath);
}

/**
 * Check if a file status represents a diffable file.
 * Diffable files are "modified" or "renamed".
 * NOT diffable: "untracked", "added", "deleted"
 */
export function isDiffableStatus(status: GitFileStatus | undefined): boolean {
  return status?.status === "modified" || status?.status === "renamed";
}

/**
 * Check if a file will be deleted when reverted.
 *
 * Untracked and added files have no committed version to restore,
 * so reverting them means deleting them from the filesystem.
 */
export function isDeletedOnRevert(status: GitFileStatus | undefined): boolean {
  return status?.status === "untracked" || status?.status === "added";
}

/**
 * Determine staged value when switching to "changes" mode.
 *
 * Returns:
 * - false: if file has unstaged changes (prefer unstaged)
 * - true: if file only has staged changes
 * - undefined: if file has no changes
 */
export function computeStagedForChangesMode(
  gitStatus: Map<string, GitFileStatus> | null | undefined,
  relativePath: string,
): boolean | undefined {
  if (!gitStatus) return undefined;

  const hasUnstagedEntry = gitStatus.has(relativePath + UNSTAGED_KEY_SUFFIX);
  const baseEntry = gitStatus.get(relativePath);
  const hasStagedEntry = baseEntry?.staged === true;
  const hasUnstagedOnlyEntry = baseEntry?.staged === false && !hasUnstagedEntry;

  if (hasUnstagedEntry || hasUnstagedOnlyEntry) {
    return false; // Prefer unstaged version
  } else if (hasStagedEntry) {
    return true; // Only staged changes exist
  }
  return undefined; // File not in changes
}

/**
 * Check which versions of a file exist in git status.
 *
 * For partially staged files, both staged and unstaged entries exist.
 * This helper returns booleans indicating which entries are present.
 *
 * @param gitStatus - The git status map
 * @param relativePath - The file's relative path
 */
export function getFileEntryPresence(
  gitStatus: Map<string, GitFileStatus> | null | undefined,
  relativePath: string,
): { hasStagedEntry: boolean; hasUnstagedEntry: boolean } {
  if (!gitStatus) return { hasStagedEntry: false, hasUnstagedEntry: false };

  const hasUnstagedWithSuffix = gitStatus.has(
    relativePath + UNSTAGED_KEY_SUFFIX,
  );
  const baseEntry = gitStatus.get(relativePath);
  const hasStagedEntry = baseEntry?.staged === true;
  const hasUnstagedOnlyEntry =
    baseEntry?.staged === false && !hasUnstagedWithSuffix;

  return {
    hasStagedEntry,
    hasUnstagedEntry: hasUnstagedWithSuffix || hasUnstagedOnlyEntry,
  };
}
