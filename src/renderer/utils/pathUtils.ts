/**
 * Path utilities for macOS's case-insensitive filesystem, where
 * JavaScript string comparisons are case-sensitive.
 */

/**
 * Normalize a path for use as a Map/Set/Object key by lowercasing it,
 * so lookups are consistent regardless of the original casing.
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
  return path.toLowerCase();
}

/**
 * Compare two file paths case-insensitively.
 *
 * @example
 * ```typescript
 * if (pathsEqual(selectedFile, currentFile)) {
 *   // Same file
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
  return path1.toLowerCase() === path2.toLowerCase();
}
