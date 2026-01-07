/**
 * useUncommittedDiffStats - Hook for subscribing to aggregate git diff stats.
 *
 * Provides real-time aggregate diff statistics (total lines added/removed)
 * for uncommitted changes, plus the git status map for file-level status.
 * Automatically subscribes to git status changes and file content changes
 * with proper debouncing.
 *
 * When triggered by git status changes, uses the event data directly for
 * gitStatus (no additional IPC call). Diff stats still require fetching.
 *
 * @example
 * ```tsx
 * const { stats, gitStatus, isGitRepo } = useUncommittedDiffStats(cwd, sandboxId);
 *
 * if (!isGitRepo || !stats) return null;
 * return (
 *   <>
 *     <span>+{stats.added} -{stats.removed}</span>
 *     <GitStatusSummary gitStatus={gitStatus} changedFilesCount={gitStatus?.size ?? 0} />
 *   </>
 * );
 * ```
 */

import { useFileSystemV2 } from "@/hooks/useFileSystemV2";
import { useGitV2 } from "@/hooks/useGitV2";
import { useGitDiffSubscription } from "@/hooks/useGitDiffSubscription";
import type {
  GitFileStatus,
  GitStatusChangedEvent,
} from "../../ipc/gitv2/types";
import { useCallback, useState } from "react";

export interface UncommittedDiffStats {
  added: number;
  removed: number;
  files: number;
}

export interface UseUncommittedDiffStatsResult {
  /** Aggregate stats, or null if not yet loaded */
  stats: UncommittedDiffStats | null;
  /** Git status map (path → status), or null if not yet loaded */
  gitStatus: Map<string, GitFileStatus> | null;
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
  {
    stats: UncommittedDiffStats | null;
    gitStatus: Map<string, GitFileStatus> | null;
    isGitRepo: boolean | null;
  }
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
  const [gitStatus, setGitStatus] = useState<Map<string, GitFileStatus> | null>(
    cached?.gitStatus ?? null,
  );
  const [isGitRepo, setIsGitRepo] = useState<boolean | null>(
    cached?.isGitRepo ?? null,
  );

  const git = useGitV2(cwd, sandboxId);
  const fs = useFileSystemV2(cwd, sandboxId);

  const fetchStats = useCallback(
    async (event?: GitStatusChangedEvent) => {
      try {
        // Check if this is a git repo first
        const root = await git.findRoot();
        if (!root) {
          setIsGitRepo(false);
          setStats(null);
          setGitStatus(null);
          statsCache.set(cacheKey, {
            stats: null,
            gitStatus: null,
            isGitRepo: false,
          });
          return;
        }

        setIsGitRepo(true);

        // Use gitStatus from event if available (no IPC call needed)
        // Otherwise fetch it (for file content changes or initial load)
        const newGitStatus =
          event?.status.files ?? (await git.getStatus())?.files ?? null;
        setGitStatus(newGitStatus);

        // Fetch aggregated diff stats (lines added/removed - not in event)
        const diffStats = await git.getUncommittedDiffStats();
        setStats(diffStats);

        statsCache.set(cacheKey, {
          stats: diffStats,
          gitStatus: newGitStatus,
          isGitRepo: true,
        });
      } catch (error) {
        console.error(
          "[useUncommittedDiffStats] Failed to fetch stats:",
          error,
        );
        setStats(null);
        // Don't update cache on error - keep previous cached value
      }
    },
    [git, cacheKey],
  );

  // Subscribe to git and file system changes
  useGitDiffSubscription(git, fs, fetchStats);

  return { stats, gitStatus, isGitRepo };
}
