/**
 * Path Normalization and Matching Utilities
 *
 * Based on: docs/pane-actions-schema.md (Override Resolution Algorithm)
 */

/**
 * Browser-compatible path resolution
 * Simplified version of path.resolve() for browser environment
 */
function resolvePath(path: string): string {
  // If already absolute, just normalize it
  if (path.startsWith('/')) {
    return normalizeParts(path);
  }

  // Relative paths are not supported in this context
  // This shouldn't happen as we expand ~ first
  return path;
}

/**
 * Normalize path by resolving . and .. segments
 */
function normalizeParts(path: string): string {
  const parts = path.split('/').filter(p => p.length > 0);
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '.') {
      // Skip current directory references
      continue;
    } else if (part === '..') {
      // Go up one directory
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }

  return '/' + resolved.join('/');
}

/**
 * Normalize a path for prefix matching
 *
 * Normalization steps:
 * 1. Expand ~ to home directory
 * 2. Resolve to absolute path
 * 3. Remove trailing slashes
 *
 * @param path - Path to normalize (e.g., "~/Projects/test/")
 * @param homeDirectory - Home directory path for ~ expansion
 * @returns Normalized absolute path (e.g., "/Users/alice/Projects/test")
 */
export function normalizePath(path: string, homeDirectory: string): string {
  // Expand ~ to home directory
  let normalized = path.startsWith('~/')
    ? path.replace('~', homeDirectory)
    : path;

  // Resolve to absolute path (browser-compatible)
  normalized = resolvePath(normalized);

  // Remove trailing slashes (but keep root "/")
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Check if candidatePath is a valid prefix of targetPath
 *
 * Rules:
 * - Must match at directory boundaries
 * - Case-sensitive matching
 * - "~/Projects" matches "~/Projects/test" but not "~/ProjectsOld"
 *
 * @param targetPath - The path to check against (current working directory)
 * @param candidatePath - The potential prefix path (from override)
 * @returns true if candidatePath is a valid prefix of targetPath
 */
export function isPrefixOf(targetPath: string, candidatePath: string): boolean {
  // Exact match is always valid
  if (targetPath === candidatePath) {
    return true;
  }

  // Check if targetPath starts with candidatePath
  if (!targetPath.startsWith(candidatePath)) {
    return false;
  }

  // Special case: root directory "/" is always a valid prefix
  if (candidatePath === '/') {
    return true;
  }

  // Ensure match is at a directory boundary
  // The character after candidatePath in targetPath must be a path separator
  const nextChar = targetPath[candidatePath.length];
  return nextChar === '/';
}

/**
 * Find the longest matching prefix path from a list of candidate paths
 *
 * Used to find the most specific override for a given current working directory.
 *
 * @param targetPath - The path to match against (current working directory)
 * @param candidatePaths - Array of potential prefix paths (from overrides)
 * @returns Index of the longest matching path, or -1 if no match
 */
export function findLongestMatch(
  targetPath: string,
  candidatePaths: string[]
): number {
  let longestMatchIndex = -1;
  let longestMatchLength = 0;

  for (let i = 0; i < candidatePaths.length; i++) {
    const candidatePath = candidatePaths[i];

    if (isPrefixOf(targetPath, candidatePath)) {
      // This path matches, check if it's the longest so far
      if (candidatePath.length > longestMatchLength) {
        longestMatchLength = candidatePath.length;
        longestMatchIndex = i;
      }
    }
  }

  return longestMatchIndex;
}
