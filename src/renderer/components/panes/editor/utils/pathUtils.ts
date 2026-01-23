/**
 * Path utilities for editor components.
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
 * Join a working directory with a relative path to create an absolute path.
 * Handles trailing slash in cwd correctly.
 *
 * @example
 * joinCwdPath("/project", "src/file.ts") // => "/project/src/file.ts"
 * joinCwdPath("/project/", "src/file.ts") // => "/project/src/file.ts"
 */
export function joinCwdPath(cwd: string, relativePath: string): string {
  return cwd.endsWith("/") ? cwd + relativePath : cwd + "/" + relativePath;
}

/**
 * Get the file name (last segment) from a file path.
 * Returns the full path if no directory separator is found.
 *
 * @param filePath - The file path (relative or absolute)
 * @returns The file name
 *
 * @example
 * getFileName("src/utils/file.ts") // => "file.ts"
 * getFileName("file.ts") // => "file.ts"
 * getFileName("/project/README.md") // => "README.md"
 */
export function getFileName(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

/**
 * Get the immediate parent directory path for a file.
 * Returns empty string for root-level files.
 *
 * Also aliased as getDirectoryPath for semantic clarity when
 * specifically working with directory paths vs parent traversal.
 *
 * @param filePath - The file path (relative or absolute)
 * @returns The parent directory path, or empty string if file is at root
 *
 * @example
 * getParentPath("src/utils/file.ts") // => "src/utils"
 * getParentPath("file.ts") // => ""
 */
export function getParentPath(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  return lastSlash === -1 ? "" : filePath.slice(0, lastSlash);
}

/**
 * Alias for getParentPath - use when extracting directory from a file path.
 * Semantically clearer in contexts where you're displaying folder paths.
 */
export const getDirectoryPath = getParentPath;

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
