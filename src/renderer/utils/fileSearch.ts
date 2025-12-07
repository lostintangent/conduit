/**
 * File search utilities using IPC to main process
 */

import type { FileSearchResult } from "./fileSearch.types";

export type { FileSearchResult };

/**
 * Search for files using IPC call to main process
 * The main process runs find command directly for maximum speed
 */
export async function searchFiles(
  rootPath: string,
  query: string,
  maxResults = 100,
): Promise<FileSearchResult[]> {
  console.log(`[FileSearch] Starting search in ${rootPath} for "${query}"`);

  try {
    const api = window.conduit;
    if (!api || !api.searchFiles) {
      console.error("[FileSearch] Search API not available");
      return [];
    }

    const results = await api.searchFiles({
      rootPath,
      query,
      maxResults,
    });

    console.log(`[FileSearch] Found ${results.length} results`);
    return results;
  } catch (error) {
    console.error("[FileSearch] Search failed:", error);
    return [];
  }
}
