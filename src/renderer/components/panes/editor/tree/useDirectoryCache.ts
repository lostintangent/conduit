import { useCallback, useEffect, useRef, useState } from "react";
import type { FileTreeNode, GitStatusMap } from "@shared/types";
import path from "path-browserify";

/**
 * Module-level cache that persists across component mounts/unmounts.
 * This is the single source of truth for directory contents.
 *
 * Key: absolute directory path (e.g., "/repo/src/components")
 * Value: { children: FileTreeNode[], version: number, fetchInProgress?: boolean }
 */
type CacheEntry = {
  children: FileTreeNode[];
  version: number;
  fetchInProgress?: boolean; // Track if a proactive refetch is currently in progress
};

const directoryCache = new Map<string, CacheEntry>();

// Subscription mechanism for cache invalidations
// Maps directory paths to their listeners
type CacheListener = (dirPath: string) => void;
const cacheListeners = new Map<string, Set<CacheListener>>();

function notifyListeners(dirPath: string) {
  const listeners = cacheListeners.get(dirPath);
  if (listeners) {
    listeners.forEach((listener) => listener(dirPath));
  }
}

function hasListeners(dirPath: string): boolean {
  const listeners = cacheListeners.get(dirPath);
  return listeners !== undefined && listeners.size > 0;
}

/**
 * Invalidate a specific directory in the cache.
 * Called by EditorPane when file watcher detects changes.
 *
 * @param dirPath - Absolute path to the directory that changed
 * @param rootPath - Root path for the repository (needed for refetching)
 */
export function invalidateDirectory(dirPath: string, rootPath?: string) {
  const entry = directoryCache.get(dirPath);

  if (entry) {
    if (hasListeners(dirPath)) {
      // Directory is currently mounted - do silent refresh by incrementing version
      // Listeners will pick this up and refetch in background
      entry.version++;
      notifyListeners(dirPath);
    } else if (rootPath) {
      // Directory is not mounted - proactively refetch to keep cache fresh
      // This prevents stale data from showing when the folder is reopened

      // Mark fetch as in-progress to prevent components from using stale data
      entry.fetchInProgress = true;

      window.conduit
        .listDirectory(dirPath, rootPath)
        .then((fetchedChildren: FileTreeNode[]) => {
          // Update cache with fresh data
          const currentEntry = directoryCache.get(dirPath);
          const newVersion = (currentEntry?.version ?? 0) + 1;

          directoryCache.set(dirPath, {
            children: fetchedChildren,
            version: newVersion,
            fetchInProgress: false, // Clear in-progress flag
          });

          // Check if component mounted while we were fetching - notify it if so
          if (hasListeners(dirPath)) {
            notifyListeners(dirPath);
          }
        })
        .catch((error: unknown) => {
          console.error(
            `[Cache] Failed to proactively refetch ${dirPath}:`,
            error,
          );
          // On error, delete the cache to force refetch on next mount
          directoryCache.delete(dirPath);
        });
    } else {
      // No rootPath provided - just delete the cache
      directoryCache.delete(dirPath);
    }
  }
}

/**
 * Invalidate a directory and remove its cached children.
 * Used for more significant changes where we want to force a refetch.
 *
 * @param dirPath - Absolute path to the directory
 */
export function clearDirectory(dirPath: string) {
  directoryCache.delete(dirPath);
}

/**
 * Handle a file change event (add/modify/delete).
 * Invalidates the parent directory.
 *
 * @param filePath - Absolute path to the file that changed
 * @param rootPath - Root path for the repository (for proactive refetching)
 */
export function handleFileChanged(filePath: string, rootPath: string) {
  const dirPath = path.dirname(filePath);
  invalidateDirectory(dirPath, rootPath);
}

/**
 * Handle a file/folder rename event.
 * Invalidates both old and new parent directories.
 * For folder renames, also clears cache entries with old path prefix.
 *
 * @param oldPath - Old absolute path
 * @param newPath - New absolute path
 * @param isDirectory - Whether the renamed item is a directory
 * @param rootPath - Root path for the repository (for proactive refetching)
 */
export function handleFileRenamed(
  oldPath: string,
  newPath: string,
  isDirectory: boolean,
  rootPath: string,
) {
  const oldDirPath = path.dirname(oldPath);
  const newDirPath = path.dirname(newPath);

  // Invalidate both parent directories
  invalidateDirectory(oldDirPath, rootPath);
  if (newDirPath !== oldDirPath) {
    invalidateDirectory(newDirPath, rootPath);
  }

  // If a directory was renamed, clear all cache entries that start with old path
  if (isDirectory) {
    const oldPathPrefix = oldPath + path.sep;
    for (const [cachedPath] of directoryCache) {
      if (cachedPath === oldPath || cachedPath.startsWith(oldPathPrefix)) {
        clearDirectory(cachedPath);
      }
    }
  }
}

/**
 * Clear the entire cache.
 * Used when switching to a different repository root.
 */
export function clearDirectoryCache() {
  directoryCache.clear();
}

type UseDirectoryCacheParams = {
  node: FileTreeNode;
  rootPath: string;
  isExpanded: boolean;
  prefetch: boolean;
  isFiltering?: boolean;
  gitStatus?: GitStatusMap | null;
};

/**
 * Custom hook for managing directory children with efficient caching.
 *
 * Features:
 * - Module-level cache persists across component mounts/unmounts
 * - Per-directory versioning for targeted invalidation
 * - Prefetches children silently in background
 * - Filters children based on git status when filtering is enabled
 *
 * This hook reads from a module-level cache that is updated by file watcher events.
 * When EditorPane receives file-changed/file-renamed events, it calls invalidateDirectory()
 * which increments the version for that specific directory, triggering a refetch only
 * in components watching that directory.
 */
export function useDirectoryCache({
  node,
  rootPath,
  isExpanded,
  prefetch,
  isFiltering,
  gitStatus,
}: UseDirectoryCacheParams) {
  const cacheKey = node.path;

  // Get current cache entry
  const cacheEntry = directoryCache.get(cacheKey);

  const [loadedChildren, setLoadedChildren] = useState<
    FileTreeNode[] | undefined
  >(cacheEntry?.children);
  // Only consider resolved if cache exists AND no fetch is in progress
  // This prevents showing stale data while proactive refetch is happening
  const [isResolved, setIsResolved] = useState(
    !!cacheEntry && !cacheEntry.fetchInProgress,
  );
  const [isLoading, setIsLoading] = useState(false);
  // Track cache version to detect external invalidations
  const [cacheVersion, setCacheVersion] = useState(cacheEntry?.version ?? 0);
  // Track previous version to detect actual changes (not just initial mount)
  // Initialize to -1 so we can detect when cache was updated while unmounted
  const prevCacheVersion = useRef(-1);
  // Track the previous cache key to detect when path changes
  const prevCacheKey = useRef(cacheKey);

  // Consolidated loading function
  const loadChildren = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) {
        setIsLoading(true);
      }

      // Capture version BEFORE fetching to detect concurrent invalidations
      const fetchStartVersion = directoryCache.get(cacheKey)?.version ?? 0;

      try {
        const fetchedChildren = await window.conduit.listDirectory(
          node.path,
          rootPath,
        );

        // Check if version changed during fetch (indicates concurrent invalidation)
        const currentEntry = directoryCache.get(cacheKey);
        const currentVersion = currentEntry?.version ?? 0;

        if (currentVersion !== fetchStartVersion) {
          // Version changed during fetch - data is stale
          console.log(
            `[Cache] Discarding stale fetch for ${cacheKey} ` +
              `(started at v${fetchStartVersion}, now v${currentVersion})`,
          );
          // Trigger a new silent fetch with current version
          loadChildren(false);
          return;
        }

        // Version unchanged - safe to update
        setLoadedChildren(fetchedChildren);
        setIsResolved(true);

        // Store in cache with version
        directoryCache.set(cacheKey, {
          children: fetchedChildren,
          version: fetchStartVersion, // Use captured version
          fetchInProgress: false, // Clear any in-progress flag
        });
      } catch (error) {
        console.error("Failed to load directory contents:", error);
        // Mark as resolved with empty array to avoid retry loops
        setLoadedChildren([]);
        setIsResolved(true);

        // Cache empty array to prevent retry loops
        directoryCache.set(cacheKey, {
          children: [],
          version: fetchStartVersion,
          fetchInProgress: false,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [node.path, rootPath, cacheKey],
  );

  // Subscribe to cache invalidation events for this directory
  useEffect(() => {
    const listener: CacheListener = (invalidatedPath) => {
      if (invalidatedPath === cacheKey) {
        // Update our local cache version to trigger a refetch
        const entry = directoryCache.get(cacheKey);
        if (entry) {
          setCacheVersion(entry.version);
        }
      }
    };

    // Add listener to this directory's listener set
    if (!cacheListeners.has(cacheKey)) {
      cacheListeners.set(cacheKey, new Set());
    }
    cacheListeners.get(cacheKey)!.add(listener);

    return () => {
      // Remove listener and clean up empty sets
      const listeners = cacheListeners.get(cacheKey);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          cacheListeners.delete(cacheKey);
        }
      }
    };
  }, [cacheKey]);

  // Load children when expanded OR prefetching (only if not already resolved)
  useEffect(() => {
    const shouldLoad = (isExpanded || prefetch) && !isResolved;
    if (shouldLoad) {
      // Only show spinner if user is actively expanding (not prefetching)
      loadChildren(isExpanded);
    }
  }, [isExpanded, prefetch, isResolved, loadChildren]);

  // Watch for cache version changes (file watcher invalidations)
  // When the version changes, we know this directory was modified externally
  useEffect(() => {
    // On first run, just sync prevVersion to current version (don't refetch, we already have data from cache)
    if (prevCacheVersion.current === -1) {
      prevCacheVersion.current = cacheVersion;
      return;
    }

    // Only refetch if version actually changed after mount
    if (
      cacheVersion !== prevCacheVersion.current &&
      cacheVersion > 0 &&
      isResolved
    ) {
      // Silently refetch in background
      prevCacheVersion.current = cacheVersion;
      loadChildren(false);
    }
  }, [cacheVersion, isResolved, loadChildren, cacheKey]);

  // Reset state when node path changes
  useEffect(() => {
    // Only reset if path actually changed (not on initial mount)
    if (prevCacheKey.current !== cacheKey) {
      const newCacheEntry = directoryCache.get(cacheKey);
      const newVersion = newCacheEntry?.version ?? 0;

      setLoadedChildren(newCacheEntry?.children);
      // Only consider resolved if cache exists AND no fetch is in progress
      setIsResolved(!!newCacheEntry && !newCacheEntry?.fetchInProgress);
      setCacheVersion(newVersion);

      // Reset prevCacheVersion to -1 so version change effect will sync on first run for new path
      prevCacheVersion.current = -1;
      prevCacheKey.current = cacheKey;
    }
  }, [cacheKey]);

  // Filter loaded children when in filter mode
  // Only apply filter if gitStatus is available (prevents empty display during git status load)
  const children =
    isFiltering && gitStatus
      ? loadedChildren?.filter((child) => {
          if (child.type === "file") {
            return gitStatus.has(child.relativePath);
          } else {
            // For directories, check if any file under it has changes
            const dirPath = child.relativePath;
            for (const [filePath] of gitStatus) {
              if (
                filePath.startsWith(dirPath + "/") ||
                filePath.startsWith(dirPath + "\\")
              ) {
                return true;
              }
            }
            return false;
          }
        })
      : loadedChildren;

  return {
    children,
    isLoading,
    loadChildren,
    isResolved,
  };
}
