/**
 * useUncommittedDiffStats - Hook for subscribing to aggregate git diff stats.
 *
 * Provides real-time aggregate diff statistics (total lines added/removed)
 * for uncommitted changes. Automatically subscribes to git status changes
 * and file content changes with proper debouncing.
 *
 * @example
 * ```tsx
 * const { stats, isGitRepo } = useUncommittedDiffStats(cwd, sandboxId);
 *
 * if (!isGitRepo || !stats) return null;
 * return <span>+{stats.added} -{stats.removed}</span>;
 * ```
 */

import { useFileSystemV2 } from "@/hooks/useFileSystemV2";
import { useGitV2 } from "@/hooks/useGitV2";
import { useGitDiffSubscription } from "@/hooks/useGitDiffSubscription";
import { useCallback, useState } from "react";

export interface UncommittedDiffStats {
  added: number;
  removed: number;
  files: number;
}

export interface UseUncommittedDiffStatsResult {
  /** Aggregate stats, or null if not yet loaded */
  stats: UncommittedDiffStats | null;
  /** Whether the cwd is a git repo (null = not yet determined) */
  isGitRepo: boolean | null;
}

/**
 * In-memory cache for stats by cwd.
 * Prevents flash when component remounts (e.g., when switching panes).
 * Cache is keyed by "cwd" or "cwd::vm:sandboxId" for cloud VMs.
 */
const statsCache = new Map<
  string,
  { stats: UncommittedDiffStats | null; isGitRepo: boolean | null }
>();

function getCacheKey(cwd: string, sandboxId?: string): string {
  return sandboxId ? `${cwd}::vm:${sandboxId}` : cwd;
}

/**
 * Hook to subscribe to aggregate uncommitted diff stats.
 *
 * @param cwd - Working directory
 * @param sandboxId - Optional sandbox ID for cloud VM operations
 */
export function useUncommittedDiffStats(
  cwd: string,
  sandboxId?: string,
): UseUncommittedDiffStatsResult {
  const cacheKey = getCacheKey(cwd, sandboxId);
  const cached = statsCache.get(cacheKey);

  // Initialize from cache to prevent flash on remount
  const [stats, setStats] = useState<UncommittedDiffStats | null>(
    cached?.stats ?? null,
  );
  const [isGitRepo, setIsGitRepo] = useState<boolean | null>(
    cached?.isGitRepo ?? null,
  );

  const git = useGitV2(cwd, sandboxId);
  const fs = useFileSystemV2(cwd, sandboxId);

  const fetchStats = useCallback(async () => {
    try {
      // Check if this is a git repo first
      const root = await git.findRoot();
      if (!root) {
        setIsGitRepo(false);
        setStats(null);
        statsCache.set(cacheKey, { stats: null, isGitRepo: false });
        return;
      }

      setIsGitRepo(true);

      // Fetch aggregated stats (derived from cached per-file stats)
      const diffStats = await git.getUncommittedDiffStats();
      setStats(diffStats);
      statsCache.set(cacheKey, { stats: diffStats, isGitRepo: true });
    } catch (error) {
      console.error("[useUncommittedDiffStats] Failed to fetch stats:", error);
      setStats(null);
      // Don't update cache on error - keep previous cached value
    }
  }, [git, cacheKey]);

  // Subscribe to git and file system changes
  useGitDiffSubscription(git, fs, fetchStats);

  return { stats, isGitRepo };
}
