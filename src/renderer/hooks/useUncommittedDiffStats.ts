/**
 * useUncommittedDiffStats - Hook for subscribing to aggregate git diff stats.
 *
 * Provides real-time aggregate diff statistics (total lines added/removed)
 * for uncommitted changes, plus the git status map for file-level status.
 * Automatically subscribes to git status changes and file content changes
 * with proper debouncing.
 *
 * It shares the cwd's cached git status and diff stats with every other
 * reader, so remounting (e.g., when switching panes) shows them right away.
 *
 * @example
 * ```tsx
 * const { stats, gitStatus, isGitRepo } = useUncommittedDiffStats(cwd);
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

import { gitKeys, gitQueries } from "@/api/gitQueries";
import type { GitFileStatus } from "@/api/GitV2API";
import { useFileSystemV2 } from "@/hooks/useFileSystemV2";
import { useGitV2 } from "@/hooks/useGitV2";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/** Debounce delay for file content changes, so typing doesn't re-read stats (ms) */
const FILE_CHANGE_DEBOUNCE_MS = 300;

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
 * Hook to subscribe to aggregate uncommitted diff stats.
 *
 * @param cwd - Working directory
 */
export function useUncommittedDiffStats(
  cwd: string,
): UseUncommittedDiffStatsResult {
  const git = useGitV2(cwd);
  const fs = useFileSystemV2(cwd);
  const queryClient = useQueryClient();

  const { data: root } = useQuery(gitQueries.root(git));
  const isGitRepo = root === undefined ? null : root !== null;

  const { data: status } = useQuery({
    ...gitQueries.status(git),
    enabled: isGitRepo === true,
  });
  const { data: stats } = useQuery({
    ...gitQueries.diffStats(git),
    enabled: isGitRepo === true,
  });

  // Editing a file changes its line counts, which status events don't carry,
  // so re-read the stats once typing settles. Status is re-read with them so
  // the file summary and the counts describe the same moment.
  useEffect(() => {
    if (!isGitRepo || !fs.onAnyFileContentChanged) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = fs.onAnyFileContentChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: gitKeys.diffStats(git.cwd),
        });
        void queryClient.invalidateQueries({
          queryKey: gitKeys.status(git.cwd),
        });
      }, FILE_CHANGE_DEBOUNCE_MS);
    });

    return () => {
      clearTimeout(timer);
      cleanup();
    };
  }, [fs, git, isGitRepo, queryClient]);

  return {
    stats: (isGitRepo && stats) || null,
    gitStatus: (isGitRepo && status?.files) || null,
    isGitRepo,
  };
}
