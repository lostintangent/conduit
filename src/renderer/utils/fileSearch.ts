/**
 * File search utilities for finding files in a directory tree
 */

import type { DirectoryEntry } from "@/../../src/ipc/fsv2/types";
import type { FileSystemV2API } from "@/api/FileSystemV2API";
import path from "path-browserify";

export interface FileSearchResult {
  path: string;
  name: string;
  relativePath: string;
}

/**
 * Recursively search for files in a directory
 * @param fsApi - FileSystem API instance
 * @param rootPath - Root directory to search from
 * @param query - Search query to filter files
 * @param maxResults - Maximum number of results to return (default: 100)
 * @param maxDepth - Maximum depth to search (default: 10)
 * @returns Array of matching files
 */
export async function searchFiles(
  fsApi: FileSystemV2API,
  rootPath: string,
  query: string,
  maxResults = 100,
  maxDepth = 10,
): Promise<FileSearchResult[]> {
  const results: FileSearchResult[] = [];
  const lowerQuery = query.toLowerCase();
  const seen = new Set<string>();

  // Directories to skip for performance
  const skipDirs = new Set([
    "node_modules",
    ".git",
    ".next",
    ".nuxt",
    "dist",
    "build",
    "out",
    ".cache",
    ".vscode",
    ".idea",
    "__pycache__",
    "coverage",
    ".pytest_cache",
    "vendor",
    "target",
  ]);

  async function searchDirectory(
    dirPath: string,
    depth: number,
  ): Promise<void> {
    if (depth > maxDepth || results.length >= maxResults) {
      return;
    }

    try {
      const entries = await fsApi.readDirectory(dirPath);

      // Process files first
      for (const entry of entries) {
        if (results.length >= maxResults) {
          return;
        }

        const fullPath = path.join(dirPath, entry.name);

        // Skip if already seen (handles symlinks)
        if (seen.has(fullPath)) {
          continue;
        }
        seen.add(fullPath);

        if (entry.type === "file") {
          // Match against filename (case-insensitive substring match)
          if (entry.name.toLowerCase().includes(lowerQuery)) {
            const relativePath = path.relative(rootPath, fullPath);
            results.push({
              path: fullPath,
              name: entry.name,
              relativePath,
            });
          }
        }
      }

      // Then recursively search directories
      for (const entry of entries) {
        if (results.length >= maxResults) {
          return;
        }

        if (entry.type === "directory") {
          // Skip common directories that shouldn't be searched
          if (skipDirs.has(entry.name) || entry.name.startsWith(".")) {
            continue;
          }

          const fullPath = path.join(dirPath, entry.name);
          if (!seen.has(fullPath)) {
            await searchDirectory(fullPath, depth + 1);
          }
        }
      }
    } catch (error) {
      // Silently skip directories we can't read (permission errors, etc.)
      console.debug(`[FileSearch] Skipping directory ${dirPath}:`, error);
    }
  }

  await searchDirectory(rootPath, 0);
  return results;
}

/**
 * Score a file match based on how well it matches the query
 * Higher scores are better matches
 */
export function scoreFileMatch(filename: string, query: string): number {
  const lowerFilename = filename.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Exact match
  if (lowerFilename === lowerQuery) {
    return 1000;
  }

  // Starts with query
  if (lowerFilename.startsWith(lowerQuery)) {
    return 500;
  }

  // Contains query as word boundary
  if (
    lowerFilename.includes(`/${lowerQuery}`) ||
    lowerFilename.includes(`-${lowerQuery}`) ||
    lowerFilename.includes(`_${lowerQuery}`)
  ) {
    return 100;
  }

  // Contains query anywhere
  if (lowerFilename.includes(lowerQuery)) {
    return 50;
  }

  return 0;
}
