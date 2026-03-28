/**
 * Path utilities for filesystem operations.
 *
 * Provides cross-platform helpers for path manipulation,
 * especially for case-insensitive filesystem handling on macOS and Windows.
 */

import * as path from "node:path";

// ============================================================================
// Case Sensitivity Utilities
// ============================================================================

/**
 * Whether the current platform has a case-insensitive filesystem.
 * True for macOS (darwin) and Windows, false for Linux.
 */
export const isCaseInsensitiveFS =
  process.platform === "darwin" || process.platform === "win32";

/**
 * Normalize a path for case-insensitive comparison.
 *
 * On case-insensitive filesystems (macOS, Windows), lowercases the path.
 * On case-sensitive filesystems (Linux), returns the path unchanged.
 *
 * Use this when comparing paths that may have different casing but refer
 * to the same file (e.g., git returns canonical paths that may differ from
 * user-provided paths).
 *
 * @param filePath - The path to normalize
 * @returns The normalized path (lowercased on case-insensitive systems)
 */
export function normalizePathForComparison(filePath: string): string {
  return isCaseInsensitiveFS ? filePath.toLowerCase() : filePath;
}

/**
 * Check if two paths are equal, handling case sensitivity correctly.
 *
 * On case-insensitive filesystems (macOS, Windows), comparison is case-insensitive.
 * On case-sensitive filesystems (Linux), comparison is case-sensitive.
 *
 * @param path1 - First path to compare
 * @param path2 - Second path to compare
 * @returns True if paths refer to the same location (case-aware)
 *
 * @example
 * // On macOS:
 * pathEquals("/Users/Foo/Project", "/users/foo/project") // true
 * // On Linux:
 * pathEquals("/Users/Foo/Project", "/users/foo/project") // false
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
