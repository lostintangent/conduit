/**
 * Path utilities for filesystem operations.
 *
 * Helpers for comparing paths on macOS's case-insensitive filesystem.
 */

import * as path from "node:path";

// ============================================================================
// Case Sensitivity Utilities
// ============================================================================

/**
 * Normalize a path for case-insensitive comparison by lowercasing it.
 *
 * Use this when comparing paths that may have different casing but refer
 * to the same file (e.g., git returns canonical paths that may differ from
 * user-provided paths).
 *
 * @param filePath - The path to normalize
 * @returns The lowercased path
 */
export function normalizePathForComparison(filePath: string): string {
  return filePath.toLowerCase();
}

/**
 * Check if two paths are equal, ignoring case.
 *
 * @param path1 - First path to compare
 * @param path2 - Second path to compare
 * @returns True if paths refer to the same location (case-aware)
 *
 * @example
 * pathEquals("/Users/Foo/Project", "/users/foo/project") // true
 */
export function pathEquals(path1: string, path2: string): boolean {
  return (
    normalizePathForComparison(path1) === normalizePathForComparison(path2)
  );
}

/**
 * Check if a path starts with a prefix, handling case sensitivity correctly.
 *
 * On case-insensitive filesystems, comparison is case-insensitive.
 * Handles both exact matches and prefix matches with path separator.
 *
 * @param filePath - The path to check
 * @param prefix - The prefix to match against
 * @returns True if filePath starts with prefix (case-aware)
 *
 * @example
 * // On macOS:
 * pathStartsWith("/Users/Foo/Project", "/users/foo") // true
 * pathStartsWith("/Users/Foo/Project-old", "/users/foo/project") // false
 */
export function pathStartsWith(filePath: string, prefix: string): boolean {
  const normalizedPath = normalizePathForComparison(filePath);
  const normalizedPrefix = normalizePathForComparison(prefix);

  // Exact match
  if (normalizedPath === normalizedPrefix) {
    return true;
  }

  // Prefix match (must be followed by path separator to avoid partial matches)
  return normalizedPath.startsWith(normalizedPrefix + path.sep);
}

/**
 * Get the relative path between two paths, handling case sensitivity correctly.
 *
 * On case-insensitive filesystems, normalizes both paths before computing
 * the relative path. This prevents `path.relative()` from returning "../.."
 * paths when the paths differ only in case.
 *
 * @param from - The base path
 * @param to - The target path
 * @returns The relative path from `from` to `to`
 *
 * @example
 * // On macOS:
 * safeRelativePath("/Users/Foo/Project", "/users/foo/project/src")
 * // Returns "src" instead of "../../users/foo/project/src"
 */
export function safeRelativePath(from: string, to: string): string {
  const normalizedFrom = normalizePathForComparison(from);
  const normalizedTo = normalizePathForComparison(to);
  return path.relative(normalizedFrom, normalizedTo);
}

/**
 * Check if a relative path indicates the target is outside the base.
 *
 * Returns true if the relative path starts with ".." (parent directory).
 *
 * @param relativePath - A relative path (from `path.relative()` or `safeRelativePath()`)
 * @returns True if the path goes outside the base directory
 */
export function isPathOutside(relativePath: string): boolean {
  return relativePath.startsWith("..");
}
