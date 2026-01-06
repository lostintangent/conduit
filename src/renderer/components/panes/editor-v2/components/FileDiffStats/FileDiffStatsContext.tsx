/**
 * FileDiffStatsContext - Provides per-file diff statistics to the component tree.
 *
 * This context handles:
 * - Fetching diff stats from the git API
 * - Subscribing to git status and file content changes to refresh stats
 * - Providing stats to any component that needs them
 *
 * Usage:
 * 1. Wrap your component tree with FileDiffStatsProvider
 * 2. Use useFileDiffStats(filePath) hook to get stats for a specific file
 *
 * @example
 * ```tsx
 * // In parent component
 * <FileDiffStatsProvider git={git} fs={fs}>
 *   <FileList />
 * </FileDiffStatsProvider>
 *
 * // In child component
 * function FileItem({ path }: { path: string }) {
 *   const stats = useFileDiffStats(path);
 *   return <span>+{stats?.added} -{stats?.removed}</span>;
 * }
 * ```
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { GitV2API } from "@/api/GitV2API";
import type { FileSystemV2API } from "@/api/FileSystemV2API";
import type {
  FileDiffStat,
  PerFileDiffStats,
} from "@/../../src/ipc/gitv2/types";

// Re-export for convenience
export type { FileDiffStat };

interface FileDiffStatsContextValue {
  /**
   * Get diff stats for a specific file.
   * Returns undefined if stats are not available for the file.
   */
  getStats: (filePath: string) => FileDiffStat | undefined;

  /** Whether stats are currently being loaded */
  isLoading: boolean;
}

// =============================================================================
// Context
// =============================================================================

const FileDiffStatsContext = createContext<FileDiffStatsContextValue | null>(
  null,
);

// =============================================================================
// Provider
// =============================================================================

export interface FileDiffStatsProviderProps {
  /** Git API instance for fetching diff stats */
  git: GitV2API;
  /** FileSystem API instance for subscribing to file content changes */
  fs: FileSystemV2API;
  /** Children to render */
  children: ReactNode;
}

/** Debounce delay for file content changes (ms) */
const FILE_CHANGE_DEBOUNCE_MS = 300;

/**
 * Provider that fetches and maintains per-file diff statistics.
 *
 * Automatically refreshes stats when:
 * - Git status changes (files added/removed, staging changes)
 * - File content changes (lines added/removed in editor)
 *
 * Place this high in the component tree to provide stats to all children.
 */
export function FileDiffStatsProvider({
  git,
  fs,
  children,
}: FileDiffStatsProviderProps) {
  const [stats, setStats] = useState<PerFileDiffStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch diff stats
  const fetchStats = useCallback(async () => {
    try {
      const diffStats = await git.getPerFileDiffStats();
      setStats(diffStats);
    } catch (error) {
      console.error(
        "[FileDiffStatsProvider] Failed to fetch diff stats:",
        error,
      );
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, [git]);

  // Debounced fetch for file content changes (avoid excessive calls while typing)
  const debouncedFetchStats = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      fetchStats();
      debounceTimerRef.current = null;
    }, FILE_CHANGE_DEBOUNCE_MS);
  }, [fetchStats]);

  // Initial fetch and subscribe to status changes
  useEffect(() => {
    let cancelled = false;

    // Initial fetch
    const init = async () => {
      await git.whenReady();
      if (!cancelled) {
        await fetchStats();
      }
    };
    init();

    // Subscribe to git status changes (files added/removed, staging changes)
    const cleanupGitStatus = git.onStatusChanged(() => {
      if (!cancelled) {
        fetchStats();
      }
    });

    // Subscribe to file content changes (lines added/removed in editor)
    // Note: fs.onAnyFileContentChanged may not exist in test environments
    let cleanupFileContent: (() => void) | undefined;
    if (fs.onAnyFileContentChanged) {
      cleanupFileContent = fs.onAnyFileContentChanged(() => {
        if (!cancelled) {
          debouncedFetchStats();
        }
      });
    }

    return () => {
      cancelled = true;
      cleanupGitStatus();
      cleanupFileContent?.();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [git, fs, fetchStats, debouncedFetchStats]);

  // Memoized getter function
  const getStats = useCallback(
    (filePath: string): FileDiffStat | undefined => {
      return stats?.get(filePath);
    },
    [stats],
  );

  const value: FileDiffStatsContextValue = {
    getStats,
    isLoading,
  };

  return (
    <FileDiffStatsContext.Provider value={value}>
      {children}
    </FileDiffStatsContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to get diff stats for a specific file.
 *
 * Must be used within a FileDiffStatsProvider.
 *
 * @param filePath - Relative path to the file
 * @returns Diff stats for the file, or undefined if not available
 *
 * @example
 * ```tsx
 * function FileItem({ path }: { path: string }) {
 *   const stats = useFileDiffStats(path);
 *   if (!stats) return null;
 *   return <span>+{stats.added} -{stats.removed}</span>;
 * }
 * ```
 */
export function useFileDiffStats(filePath: string): FileDiffStat | undefined {
  const context = useContext(FileDiffStatsContext);

  if (!context) {
    // Return undefined if used outside provider (graceful degradation)
    return undefined;
  }

  return context.getStats(filePath);
}
