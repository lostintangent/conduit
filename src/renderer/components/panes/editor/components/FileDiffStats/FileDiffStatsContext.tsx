/**
 * FileDiffStatsContext - Provides per-file diff statistics to the component tree.
 *
 * This context handles:
 * - Reading per-file diff stats from the cwd's shared git cache
 * - Re-reading them when git status or file content changes
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
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { gitKeys, gitQueries } from "@features/git/client/queries";
import type { GitSubscription } from "@features/git/client/GitSubscription";
import type { FileSystemSubscription } from "@features/files/client/FileSystemSubscription";
import { useFileEditsSettled } from "@features/files/components/useFileEditsSettled";
import type { FileDiffStat } from "@features/git/model";

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
  /** Git subscription for fetching diff stats */
  git: GitSubscription;
  /** File system subscription for subscribing to file content changes */
  fs: FileSystemSubscription;
  /** Children to render */
  children: ReactNode;
}

/**
 * Provider for per-file diff statistics, read from the cwd's shared git cache.
 *
 * Stats are re-read when:
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
  const queryClient = useQueryClient();
  const { data: root } = useQuery(gitQueries.root(git));
  const isGitRepo = !!root;
  const { data: stats = null } = useQuery({
    ...gitQueries.perFileDiffStats(git),
    enabled: isGitRepo,
  });

  // Status events re-read the stats, but edits that keep a file's status
  // only change its line counts
  useFileEditsSettled(fs, isGitRepo, () => {
    void queryClient.invalidateQueries({
      queryKey: gitKeys.perFileDiffStats(git.cwd),
    });
  });

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
