/**
 * Content search utilities using IPC to main process
 */

export interface ContentSearchResult {
  path: string;
  relativePath: string;
  line: number;
  content: string;
  matchStart: number;
  matchEnd: number;
}

/**
 * Search for content in files using IPC call to main process
 * The main process runs grep command directly for maximum speed
 */
export async function searchContent(
  rootPath: string,
  query: string,
  caseSensitive = false,
  maxResults = 100,
): Promise<ContentSearchResult[]> {
  console.log(
    `[ContentSearch] Starting search in ${rootPath} for "${query}" (caseSensitive: ${caseSensitive})`,
  );

  try {
    const api = window.conduit;
    if (!api || !api.searchContent) {
      console.error("[ContentSearch] Search API not available");
      return [];
    }

    const results = await api.searchContent({
      rootPath,
      query,
      caseSensitive,
      maxResults,
    });

    console.log(`[ContentSearch] Found ${results.length} results`);
    return results;
  } catch (error) {
    console.error("[ContentSearch] Search failed:", error);
    return [];
  }
}
