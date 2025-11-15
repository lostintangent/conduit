import { useCallback, useEffect, useRef, useState } from "react";
import type { FileTreeNode, GitStatusMap } from "@shared/types";
import path from "path-browserify";

/**
 * Module-level cache that persists across component mounts/unmounts.
 * This is the single source of truth for directory contents.
 *
 * Key: absolute directory path (e.g., "/repo/src/components")
 * Value: { children: FileTreeNode[], version: number }
 */
type CacheEntry = {
  children: FileTreeNode[];
  version: number;
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
      window.conduit
        .listDirectory(dirPath, rootPath)
        .then((fetchedChildren) => {
          // Update cache with fresh data
          const currentEntry = directoryCache.get(dirPath);
          const newVersion = (currentEntry?.version ?? 0) + 1;
          directoryCache.set(dirPath, {
            children: fetchedChildren,
            version: newVersion,
          });

          // Check if component mounted while we were fetching - notify it if so
          if (hasListeners(dirPath)) {
            notifyListeners(dirPath);
          }
        })
        .catch((error) => {
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
  const [isResolved, setIsResolved] = useState(!!cacheEntry);
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

      try {
        const fetchedChildren = await window.conduit.listDirectory(
          node.path,
          rootPath,
        );
        setLoadedChildren(fetchedChildren);
        setIsResolved(true);

        // Store in cache with version
        const existingEntry = directoryCache.get(cacheKey);
        directoryCache.set(cacheKey, {
          children: fetchedChildren,
          version: existingEntry?.version ?? 0, // Preserve version if exists
        });
      } catch (error) {
        console.error("Failed to load directory contents:", error);
        setLoadedChildren([]);
        setIsResolved(true);

        // Store empty result in cache
        const existingEntry = directoryCache.get(cacheKey);
        directoryCache.set(cacheKey, {
          children: [],
          version: existingEntry?.version ?? 0,
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
      setIsResolved(!!newCacheEntry);
      setCacheVersion(newVersion);

      // Reset prevCacheVersion to -1 so version change effect will sync on first run for new path
      prevCacheVersion.current = -1;
      prevCacheKey.current = cacheKey;
    }
  }, [cacheKey]);

  // Filter loaded children when in filter mode
  const children = isFiltering
    ? loadedChildren?.filter((child) => {
        if (child.type === "file") {
          return gitStatus?.has(child.relativePath);
        } else {
          // For directories, check if any file under it has changes
          const dirPath = child.relativePath;
          if (!gitStatus) return false;
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
