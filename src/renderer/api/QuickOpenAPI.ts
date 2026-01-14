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
        return [];
      }

      const cache = await api.getPreWarmedCache(this.cwd);

      if (!cache || !cache.valid) {
        return [];
      }

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
        return;
      }

      await api.warmFileCache(this.cwd);
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
        return;
      }

      await api.clearFileCache(this.cwd);
    } catch (error) {
      console.error("[QuickOpenAPI] Failed to clear cache:", error);
    }
  }
}
