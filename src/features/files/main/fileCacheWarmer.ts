import { FileSystemProviderService } from "./FileSystemProviderService";
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
  // Don't warm cache for unsafe/broad directories (root, home)
  const isSafeDirectory =
    workspaceRoot &&
    !workspaceRoot.match(
      /^(\/|\/Users\/[^/]+|\/home\/[^/]+|C:\\Users\\[^\\]+)$/,
    );

  if (!isSafeDirectory) {
    return;
  }

  // Don't start multiple warming processes
  if (warmingInProgressMap.get(workspaceRoot)) {
    return;
  }

  // If we have recent valid cache, skip
  const existingCache = fileCacheMap.get(workspaceRoot);
  if (existingCache?.valid) {
    const age = Date.now() - existingCache.timestamp;
    if (age < 60000) {
      // Fresh within 1 minute
      return;
    }
  }

  warmingInProgressMap.set(workspaceRoot, true);

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

    // Setup event-based watchers
    const cleanup = await setupCacheWatcher(workspaceRoot);

    // Store in cache map
    fileCacheMap.set(workspaceRoot, {
      root: workspaceRoot,
      files: result.files,
      timestamp: Date.now(),
      valid: true, // Initially valid
      watcherCleanup: cleanup,
    });

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
  });
  cleanups.push(() => dirChangeDisposable.dispose());

  // Watch for file deletions - remove from cache
  const deleteDisposable = provider.onFileDeleted((event) => {
    const cache = fileCacheMap.get(workspaceRoot);
    if (!cache) return;

    const idx = cache.files.indexOf(event.path);
    if (idx !== -1) {
      cache.files.splice(idx, 1);
    }
  });
  cleanups.push(() => deleteDisposable.dispose());

  // Watch for file renames - update path in cache
  const renameDisposable = provider.onFileRenamed((event) => {
    const cache = fileCacheMap.get(workspaceRoot);
    if (!cache) return;

    const idx = cache.files.indexOf(event.oldPath);
    if (idx !== -1) {
      cache.files[idx] = event.newPath;
    }
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
 * Returns only serializable data (no functions)
 */
export function getPreWarmedCache(workspaceRoot: string): {
  root: string;
  files: string[];
  timestamp: number;
  valid: boolean;
} | null {
  const cache = fileCacheMap.get(workspaceRoot);

  if (!cache || !cache.valid) {
    return null;
  }

  // Return only serializable data (exclude watcherCleanup function)
  return {
    root: cache.root,
    files: cache.files,
    timestamp: cache.timestamp,
    valid: cache.valid,
  };
}
