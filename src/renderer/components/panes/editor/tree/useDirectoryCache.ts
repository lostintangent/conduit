import { useCallback, useEffect, useMemo, useState } from "react";
import type { FileTreeNode, GitStatusMap } from "@shared/types";

const api = window.conduit;

type UseDirectoryCacheParams = {
  node: FileTreeNode;
  rootPath: string;
  isExpanded: boolean;
  prefetch: boolean;
  treeVersion?: number;
  isFiltering?: boolean;
  gitStatus?: GitStatusMap | null;
};

/**
 * Custom hook for managing directory children cache with smart loading and silent refresh.
 *
 * Features:
 * - Caches children to avoid re-fetching on collapse/expand
 * - Prefetches children silently in background
 * - Silent refresh when tree version changes (file watcher updates)
 * - Filters children based on git status when filtering is enabled
 */
export function useDirectoryCache({
  node,
  rootPath,
  isExpanded,
  prefetch,
  treeVersion,
  isFiltering,
  gitStatus,
}: UseDirectoryCacheParams) {
  const [loadedChildren, setLoadedChildren] = useState<
    FileTreeNode[] | undefined
  >(undefined);
  const [isResolved, setIsResolved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Consolidated loading function
  const loadChildren = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) {
        setIsLoading(true);
      }

      try {
        const fetchedChildren = await api.listDirectory(node.path, rootPath);
        setLoadedChildren(fetchedChildren);
        setIsResolved(true);
      } catch (error) {
        console.error("Failed to load directory contents:", error);
        setLoadedChildren([]);
        setIsResolved(true); // Mark as resolved even on error to avoid retry loops
      } finally {
        setIsLoading(false);
      }
    },
    [node.path, rootPath],
  );

  // Load children when expanded OR prefetching (only if not already resolved)
  useEffect(() => {
    const shouldLoad = (isExpanded || prefetch) && !isResolved;
    if (shouldLoad) {
      // Only show spinner if user is actively expanding (not prefetching)
      loadChildren(isExpanded);
    }
  }, [isExpanded, prefetch, isResolved, loadChildren]);

  // Clear loaded children and resolved flag when node path changes
  useEffect(() => {
    setLoadedChildren(undefined);
    setIsResolved(false);
  }, [node.path]);

  // Silent background refresh when tree version changes
  useEffect(() => {
    // Only refresh if this directory has been loaded before
    if (treeVersion !== undefined && isResolved) {
      // Silently refetch in background without showing spinner
      loadChildren(false);
    }
  }, [treeVersion, isResolved, loadChildren]);

  // Filter loaded children when in filter mode
  const children = useMemo(() => {
    if (!isFiltering || !loadedChildren || !gitStatus) {
      return loadedChildren;
    }

    // Filter to only show files with git status and directories containing changes
    return loadedChildren.filter((child) => {
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
    });
  }, [loadedChildren, isFiltering, gitStatus]);

  return {
    children,
    isLoading,
    loadChildren,
    isResolved,
  };
}
