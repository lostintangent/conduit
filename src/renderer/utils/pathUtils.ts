/**
 * Path utilities for cross-platform path handling.
 *
 * Provides case-insensitive path operations for macOS and Windows,
 * where the filesystem is case-insensitive but JavaScript string
 * comparisons are case-sensitive.
 */

/**
 * Whether the current platform uses case-insensitive file paths.
 * macOS and Windows are case-insensitive by default.
 */
export const isCaseInsensitiveFs = (() => {
  const platform = navigator.platform.toLowerCase();
  return platform.includes("mac") || platform.includes("win");
})();

/**
 * Normalize a path for use as a Map/Set/Object key.
 * On case-insensitive filesystems (macOS/Windows), lowercases the path
 * to ensure consistent lookups regardless of the original casing.
 *
 * Use this when storing or looking up paths in:
 * - Map keys
 * - Set values
 * - Object property keys (caches, etc.)
 *
 * @example
 * ```typescript
 * const cache = new Map<string, Data>();
 * cache.set(normalizePathForKey(path), data);
 * const data = cache.get(normalizePathForKey(path));
 * ```
 */
export function normalizePathForKey(path: string): string {
  return isCaseInsensitiveFs ? path.toLowerCase() : path;
}

/**
 * Compare two file paths, respecting platform case sensitivity.
 * On macOS/Windows, paths are compared case-insensitively.
 * On Linux, paths are compared case-sensitively.
 *
 * @example
 * ```typescript
 * if (pathsEqual(selectedFile, currentFile)) {
 *   // Same file (case-insensitive on macOS/Windows)
 * }
 * ```
 */
export function pathsEqual(
  path1: string | null | undefined,
  path2: string | null | undefined,
): boolean {
  if (path1 == null || path2 == null) {
    return path1 === path2;
  }
  if (isCaseInsensitiveFs) {
    return path1.toLowerCase() === path2.toLowerCase();
  }
  return path1 === path2;
}
