import { FileSystemProviderService } from "../fsv2/FileSystemProviderService";
import {
  scanDirectoryWithRipgrep,
  type RipgrepScanResult,
} from "./ripgrepScanner";

interface CachedFileData {
  root: string;
  files: string[];
  timestamp: number;
  valid: boolean; // Event-based, not time-based!
  watcherCleanup?: () => void;
}

const fileCacheMap = new Map<string, CachedFileData>();
const warmingInProgressMap = new Map<string, boolean>();

/**
 * Start warming the file cache in the background
 * Sets up event-based watchers for real-time updates
 */
export async function warmFileCache(workspaceRoot: string): Promise<void> {
  // Don't start multiple warming processes
  if (warmingInProgressMap.get(workspaceRoot)) {
    console.log("[FileCacheWarmer] Already warming cache for", workspaceRoot);
    return;
  }

  // If we have recent valid cache, skip
  const existingCache = fileCacheMap.get(workspaceRoot);
  if (existingCache?.valid) {
    const age = Date.now() - existingCache.timestamp;
    if (age < 60000) {
      // Fresh within 1 minute
      console.log(
        `[FileCacheWarmer] Cache is fresh (${age}ms old), skipping scan`,
      );
      return;
    }
  }

  warmingInProgressMap.set(workspaceRoot, true);
  console.log(
    "[FileCacheWarmer] Starting background file scan for",
    workspaceRoot,
  );
  const startTime = Date.now();

  try {
    // Use ripgrep for ultra-fast scanning
    const result: RipgrepScanResult = await scanDirectoryWithRipgrep(
      workspaceRoot,
      {
        maxDepth: 15,
        maxFiles: 50000,
        includeHidden: false,
      },
    );

    const duration = Date.now() - startTime;

    // Setup event-based watchers (KEY IMPROVEMENT)
    const cleanup = await setupCacheWatcher(workspaceRoot);

    // Store in cache map
    fileCacheMap.set(workspaceRoot, {
      root: workspaceRoot,
      files: result.files,
      timestamp: Date.now(),
      valid: true, // Initially valid
      watcherCleanup: cleanup,
    });

    console.log(
      `[FileCacheWarmer] ✅ Cache warmed for ${workspaceRoot}: ${result.files.length} files in ${duration}ms`,
    );

    if (result.errors.length > 0) {
      console.warn("[FileCacheWarmer] Errors during scan:", result.errors);
    }
  } catch (error) {
    console.error("[FileCacheWarmer] Failed to warm cache:", error);
  } finally {
    warmingInProgressMap.set(workspaceRoot, false);
  }
}

/**
 * Setup event-based watchers for cache invalidation
 * KEY IMPROVEMENT: Use FileSystemProvider events instead of timeouts
 */
async function setupCacheWatcher(workspaceRoot: string): Promise<() => void> {
  const fsService = FileSystemProviderService.getInstance();
  const provider = await fsService.getProvider(workspaceRoot);

  const cleanups: Array<() => void> = [];

  // Watch for directory changes - incremental update
  const dirChangeDisposable = provider.onDirectoryListingChanged((event) => {
    const cache = fileCacheMap.get(workspaceRoot);
    if (!cache) return;

    console.log(`[FileCacheWarmer] Directory changed: ${event.path}`);

    // Incremental update: remove old files from this directory, add new ones
    cache.files = cache.files.filter((f) => !f.startsWith(event.path));

    for (const entry of event.entries) {
      if (entry.type === "file") {
        const fullPath = `${event.path}/${entry.name}`;
        if (!cache.files.includes(fullPath)) {
          cache.files.push(fullPath);
        }
      }
    }

    // Cache still valid! No full re-scan needed.
    console.log(
      `[FileCacheWarmer] Cache updated incrementally (${cache.files.length} files)`,
    );
  });
  cleanups.push(() => dirChangeDisposable.dispose());

  // Watch for file deletions - remove from cache
  const deleteDisposable = provider.onFileDeleted((event) => {
    const cache = fileCacheMap.get(workspaceRoot);
    if (!cache) return;

    console.log(`[FileCacheWarmer] File deleted: ${event.path}`);

    const idx = cache.files.indexOf(event.path);
    if (idx !== -1) {
      cache.files.splice(idx, 1);
      console.log(
        `[FileCacheWarmer] Removed from cache (${cache.files.length} files)`,
      );
    }

    // Cache still valid!
  });
  cleanups.push(() => deleteDisposable.dispose());

  // Watch for file renames - update path in cache
  const renameDisposable = provider.onFileRenamed((event) => {
    const cache = fileCacheMap.get(workspaceRoot);
    if (!cache) return;

    console.log(
      `[FileCacheWarmer] File renamed: ${event.oldPath} → ${event.newPath}`,
    );

    const idx = cache.files.indexOf(event.oldPath);
    if (idx !== -1) {
      cache.files[idx] = event.newPath;
      console.log("[FileCacheWarmer] Updated path in cache");
    }

    // Cache still valid!
  });
  cleanups.push(() => renameDisposable.dispose());

  return () => {
    cleanups.forEach((c) => c());
    // Release provider when cache is cleared
    fsService.releaseProvider(workspaceRoot);
  };
}

/**
 * Get the pre-warmed cache if available and valid
 */
export function getPreWarmedCache(
  workspaceRoot: string,
): CachedFileData | null {
  const cache = fileCacheMap.get(workspaceRoot);

  if (!cache) {
    console.log("[FileCacheWarmer] No cache found for", workspaceRoot);
    return null;
  }

  if (!cache.valid) {
    console.log("[FileCacheWarmer] Cache invalid, needs refresh");
    return null;
  }

  console.log(
    `[FileCacheWarmer] Returning valid cache (${cache.files.length} files)`,
  );
  return cache;
}

/**
 * Clear the cache for a specific workspace root (or all)
 */
export function clearFileCache(workspaceRoot?: string): void {
  if (workspaceRoot) {
    console.log("[FileCacheWarmer] Clearing cache for", workspaceRoot);
    const cache = fileCacheMap.get(workspaceRoot);
    if (cache?.watcherCleanup) {
      cache.watcherCleanup();
    }
    fileCacheMap.delete(workspaceRoot);
    warmingInProgressMap.delete(workspaceRoot);
  } else {
    console.log("[FileCacheWarmer] Clearing all caches");
    for (const cache of fileCacheMap.values()) {
      if (cache.watcherCleanup) {
        cache.watcherCleanup();
      }
    }
    fileCacheMap.clear();
    warmingInProgressMap.clear();
  }
}

/**
 * Check if warming is in progress
 */
export function isWarmingInProgress(workspaceRoot?: string): boolean {
  if (workspaceRoot) {
    return warmingInProgressMap.get(workspaceRoot) ?? false;
  }
  return Array.from(warmingInProgressMap.values()).some((warming) => warming);
}
