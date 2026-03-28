/**
 * File search IPC handlers
 */

import { ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";

export interface FileSearchRequest {
  rootPath: string;
  query: string;
  maxResults?: number;
}

export interface FileSearchResult {
  path: string;
  name: string;
  relativePath: string;
}

const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  "dist",
  "build",
  "out",
  ".cache",
  "__pycache__",
  ".pytest_cache",
  "vendor",
  "target",
  "coverage",
]);

async function searchFiles(
  rootPath: string,
  query: string,
  maxResults: number,
): Promise<FileSearchResult[]> {
  const results: FileSearchResult[] = [];
  const lowerQuery = query.toLowerCase();
  const dirsToProcess: string[] = [rootPath];

  while (dirsToProcess.length > 0 && results.length < maxResults) {
    const currentDir = dirsToProcess.pop()!;

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) break;

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) {
          dirsToProcess.push(fullPath);
        }
      } else if (entry.isFile()) {
        if (entry.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            path: fullPath,
            name: entry.name,
            relativePath: path.relative(rootPath, fullPath),
          });
        }
      }
    }
  }

  return results;
}

export function registerSearchHandlers(): void {
  ipcMain.handle(
    "search:files",
    async (_, request: FileSearchRequest): Promise<FileSearchResult[]> => {
      const { rootPath, query, maxResults = 100 } = request;

      try {
        console.log(`[FileSearch] Searching in ${rootPath} for "${query}"`);
        const results = await searchFiles(rootPath, query, maxResults);
        console.log(`[FileSearch] Found ${results.length} results`);
        return results;
      } catch (error) {
        console.error("[FileSearch] Search failed:", error);
        return [];
      }
    },
  );
}
