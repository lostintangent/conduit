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
 * 3. Use useSectionTotalStats(staged) hook to get totals for section headers
 *
 * @example
 * ```tsx
 * // In parent component
 * <FileDiffStatsProvider git={git} fs={fs}>
 *   <FileList />
 * </FileDiffStatsProvider>
 *
 * // In child component - per-file stats
 * function FileItem({ path }: { path: string }) {
 *   const stats = useFileDiffStats(path);
 *   return <span>+{stats?.added} -{stats?.removed}</span>;
 * }
 *
 * // In section header - total stats
 * function SectionHeader({ isStaged }: { isStaged: boolean }) {
 *   const totals = useSectionTotalStats(isStaged);
 *   return <span>+{totals?.added} -{totals?.removed}</span>;
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
  useMemo,
  type ReactNode,
} from "react";
import type { GitV2API } from "@/api/GitV2API";
import type { FileSystemV2API } from "@/api/FileSystemV2API";
import type {
  FileDiffStat,
  SplitPerFileDiffStats,
} from "@/../../src/ipc/gitv2/types";

// Re-export for convenience
export type { FileDiffStat };

/** Pre-computed section totals (memoized to avoid recalculation on every access) */
interface SectionTotals {
  staged: FileDiffStat | undefined;
  unstaged: FileDiffStat | undefined;
}

interface FileDiffStatsContextValue {
  /**
   * Get diff stats for a specific file.
   *
   * @param filePath - Relative path to the file
   * @param staged - If provided, only look in that section's stats.
   *                 If undefined, combines stats for partially staged files.
   * @returns Diff stats for the file, or undefined if not available
   */
  getStats: (filePath: string, staged?: boolean) => FileDiffStat | undefined;

  /**
   * Pre-computed section totals.
   * Access via sectionTotals.staged or sectionTotals.unstaged.
   * Memoized to avoid O(n) iteration on every component render.
   */
  sectionTotals: SectionTotals;

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
  const [stats, setStats] = useState<SplitPerFileDiffStats | null>(null);
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

  // Memoized getter function for per-file stats
  const getStats = useCallback(
    (filePath: string, staged?: boolean): FileDiffStat | undefined => {
      if (!stats) return undefined;

      // If staged is specified, only look in that section
      if (staged === true) {
        return stats.staged.get(filePath);
      }
      if (staged === false) {
        return stats.unstaged.get(filePath);
      }

      // If staged is undefined, combine stats for partially staged files
      // (backward compatible behavior for contexts that don't track staging)
      const stagedStat = stats.staged.get(filePath);
      const unstagedStat = stats.unstaged.get(filePath);

      if (stagedStat && unstagedStat) {
        return {
          added: stagedStat.added + unstagedStat.added,
          removed: stagedStat.removed + unstagedStat.removed,
        };
      }

      return stagedStat || unstagedStat;
    },
    [stats],
  );

  // Pre-compute section totals (calculated once when stats change, not on every access)
  const sectionTotals = useMemo((): SectionTotals => {
    if (!stats) {
      return { staged: undefined, unstaged: undefined };
    }

    const calculateTotal = (
      map: Map<string, FileDiffStat>,
    ): FileDiffStat | undefined => {
      if (map.size === 0) return undefined;

      let totalAdded = 0;
      let totalRemoved = 0;

      for (const fileStat of map.values()) {
        totalAdded += fileStat.added;
        totalRemoved += fileStat.removed;
      }

      return { added: totalAdded, removed: totalRemoved };
    };

    return {
      staged: calculateTotal(stats.staged),
      unstaged: calculateTotal(stats.unstaged),
    };
  }, [stats]);

  const value: FileDiffStatsContextValue = {
    getStats,
    sectionTotals,
    isLoading,
  };

  return (
    <FileDiffStatsContext.Provider value={value}>
      {children}
    </FileDiffStatsContext.Provider>
  );
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to get diff stats for a specific file.
 *
 * Must be used within a FileDiffStatsProvider.
 *
 * @param filePath - Relative path to the file
 * @param staged - If provided, only get stats for that section (true=staged, false=unstaged).
 *                 If undefined, combines stats for partially staged files.
 * @returns Diff stats for the file, or undefined if not available
 *
 * @example
 * ```tsx
 * // Get stats for a file in a specific section
 * function FileItem({ path, isStaged }: { path: string; isStaged: boolean }) {
 *   const stats = useFileDiffStats(path, isStaged);
 *   if (!stats) return null;
 *   return <span>+{stats.added} -{stats.removed}</span>;
 * }
 * ```
 */
export function useFileDiffStats(
  filePath: string,
  staged?: boolean,
): FileDiffStat | undefined {
  const context = useContext(FileDiffStatsContext);

  if (!context) {
    // Return undefined if used outside provider (graceful degradation)
    return undefined;
  }

  return context.getStats(filePath, staged);
}

/**
 * Hook to get total diff stats for a section (staged or unstaged).
 *
 * Must be used within a FileDiffStatsProvider.
 * Returns pre-computed totals (O(1) access, no iteration).
 *
 * @param staged - If true, get totals for staged files; if false, for unstaged
 * @returns Total diff stats for the section, or undefined if not available
 *
 * @example
 * ```tsx
 * function SectionHeader({ isStaged }: { isStaged: boolean }) {
 *   const totals = useSectionTotalStats(isStaged);
 *   if (!totals) return null;
 *   return <span>+{totals.added} -{totals.removed}</span>;
 * }
 * ```
 */
export function useSectionTotalStats(
  staged: boolean,
): FileDiffStat | undefined {
  const context = useContext(FileDiffStatsContext);

  if (!context) {
    // Return undefined if used outside provider (graceful degradation)
    return undefined;
  }

  return staged ? context.sectionTotals.staged : context.sectionTotals.unstaged;
}
