/**
 * QuickOpenAPI - Thin wrapper over IPC for Quick Open cache
 * Follows the pattern of GitV2API and FileSystemV2API
 */
export class QuickOpenAPI {
  constructor(private cwd: string) {}

  /**
   * Get pre-warmed file cache if available
   */
  async getPreWarmedCache(): Promise<string[]> {
    try {
      const api = (window as any).conduit?.fsv2;
      if (!api?.getPreWarmedCache) {
        console.warn("[QuickOpenAPI] getPreWarmedCache not available");
        return [];
      }

      const cache = await api.getPreWarmedCache(this.cwd);

      if (!cache) {
        console.log("[QuickOpenAPI] No pre-warmed cache found");
        return [];
      }

      if (!cache.valid) {
        console.log("[QuickOpenAPI] Cache invalid, returning empty");
        return [];
      }

      console.log(
        `[QuickOpenAPI] Loaded ${cache.files.length} files from cache`,
      );
      return cache.files;
    } catch (error) {
      console.error("[QuickOpenAPI] Failed to get pre-warmed cache:", error);
      return [];
    }
  }

  /**
   * Trigger cache warming for a workspace
   */
  async warmCache(): Promise<void> {
    try {
      const api = (window as any).conduit?.fsv2;
      if (!api?.warmFileCache) {
        console.warn("[QuickOpenAPI] warmFileCache not available");
        return;
      }

      await api.warmFileCache(this.cwd);
      console.log("[QuickOpenAPI] Cache warming triggered");
    } catch (error) {
      console.error("[QuickOpenAPI] Failed to warm cache:", error);
    }
  }

  /**
   * Clear the cache for this workspace
   */
  async clearCache(): Promise<void> {
    try {
      const api = (window as any).conduit?.fsv2;
      if (!api?.clearFileCache) {
        console.warn("[QuickOpenAPI] clearFileCache not available");
        return;
      }

      await api.clearFileCache(this.cwd);
      console.log("[QuickOpenAPI] Cache cleared");
    } catch (error) {
      console.error("[QuickOpenAPI] Failed to clear cache:", error);
    }
  }
}
