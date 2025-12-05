/**
 * Path utilities for editor-v2 components.
 *
 * Re-exports shared path utilities and adds editor-specific functions.
 */

import { pathsEqual } from "@/utils/pathUtils";

// Re-export shared path utilities
export {
  isCaseInsensitiveFs,
  normalizePathForKey,
  pathsEqual,
} from "@/utils/pathUtils";

/**
 * Get all parent directory paths for a file path.
 * Works with both relative paths (e.g., "src/utils/file.ts")
 * and absolute paths (e.g., "/Users/name/project/file.ts").
 *
 * @param filePath - The file path to get parents for
 * @param rootPath - Optional root to stop at (won't include paths above this)
 * @returns Array of parent paths from root down to immediate parent
 *
 * @example
 * getParentPaths("src/utils/helpers/file.ts")
 * // => ["src", "src/utils", "src/utils/helpers"]
 *
 * @example
 * getParentPaths("/project/src/file.ts", "/project")
 * // => ["/project/src"]
 */
export function getParentPaths(filePath: string, rootPath?: string): string[] {
  const parts = filePath.split("/").filter(Boolean);
  const isAbsolute = filePath.startsWith("/");
  const parents: string[] = [];

  let currentPath = isAbsolute ? "" : "";

  for (let i = 0; i < parts.length - 1; i++) {
    currentPath = currentPath
      ? `${currentPath}/${parts[i]}`
      : isAbsolute
        ? `/${parts[i]}`
        : parts[i];

    // Skip if we haven't reached the root yet
    if (rootPath && currentPath.length < rootPath.length) {
      continue;
    }

    // Stop if this would be at or above the root
    if (rootPath && pathsEqual(currentPath, rootPath)) {
      continue;
    }

    parents.push(currentPath);
  }

  return parents;
}
