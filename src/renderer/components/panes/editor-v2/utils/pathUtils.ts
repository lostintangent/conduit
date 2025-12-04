/**
 * Path utilities for editor-v2 components.
 *
 * Handles cross-platform path comparison, particularly for case-insensitive
 * filesystems like macOS and Windows.
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
 * Compare two file paths, respecting platform case sensitivity.
 * On macOS/Windows, paths are compared case-insensitively.
 * On Linux, paths are compared case-sensitively.
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
