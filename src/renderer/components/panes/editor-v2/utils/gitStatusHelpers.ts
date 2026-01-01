/**
 * Git status helpers for editor v2.
 *
 * These utilities handle the complexity of partially staged files,
 * where the same file can appear twice in the git status map:
 * - Staged entry: key is the file path
 * - Unstaged entry: key is the file path + UNSTAGED_KEY_SUFFIX
 */

import type { GitFileStatus } from "@/../../src/ipc/gitv2/types";

/**
 * Suffix used to distinguish unstaged entries of partially staged files
 * in the git status Map.
 */
export const UNSTAGED_KEY_SUFFIX = "\0unstaged";

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

  const hasUnstagedWithSuffix = gitStatus.has(relativePath + UNSTAGED_KEY_SUFFIX);
  const baseEntry = gitStatus.get(relativePath);
  const hasStagedEntry = baseEntry?.staged === true;
  const hasUnstagedOnlyEntry =
    baseEntry?.staged === false && !hasUnstagedWithSuffix;

  return {
    hasStagedEntry,
    hasUnstagedEntry: hasUnstagedWithSuffix || hasUnstagedOnlyEntry,
  };
}
