/**
 * useGitDiffSubscription - Shared subscription logic for git diff stats.
 *
 * Handles the common pattern of:
 * - Waiting for git to be ready
 * - Subscribing to git status changes (immediate refresh)
 * - Subscribing to file content changes (debounced refresh)
 * - Proper cleanup with cancelled flag
 *
 * Used by both FileDiffStatsContext (per-file stats) and
 * useUncommittedDiffStats (aggregate stats) to avoid duplication.
 *
 * The callback receives an optional GitStatusChangedEvent parameter:
 * - When triggered by git status change: event is defined (use event.status directly)
 * - When triggered by file content change: event is undefined (must fetch)
 *
 * @example
 * ```tsx
 * const fetchStats = useCallback(async (event) => {
 *   // Can use event?.status.files directly if available
 *   const stats = await git.getPerFileDiffStats();
 *   setStats(stats);
 * }, [git]);
 *
 * useGitDiffSubscription(git, fs, fetchStats);
 * ```
 */

import type { FileSystemV2API } from "@/api/FileSystemV2API";
import type { GitV2API } from "@/api/GitV2API";
import type { GitStatusChangedEvent } from "../../ipc/gitv2/types";
import { useCallback, useEffect, useRef } from "react";

/** Debounce delay for file content changes (ms) */
const FILE_CHANGE_DEBOUNCE_MS = 300;

/**
 * Hook that subscribes to git and file system changes and calls fetchStats when needed.
 *
 * @param git - Git API instance
 * @param fs - FileSystem API instance
 * @param fetchStats - Async function to fetch stats (called on init and changes).
 *                     Receives GitStatusChangedEvent when triggered by status change,
 *                     undefined when triggered by file content change or initial fetch.
 * @param skip - If true, skip all subscriptions (useful for known non-git directories)
 */
export function useGitDiffSubscription(
  git: GitV2API,
  fs: FileSystemV2API,
  fetchStats: (event?: GitStatusChangedEvent) => Promise<void>,
  skip = false,
): void {
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Initial fetch and subscribe to changes
  useEffect(() => {
    // Skip all subscriptions if requested (e.g., for known non-git directories)
    if (skip) {
      return;
    }

    let cancelled = false;

    // Initial fetch (wait for git to be ready)
    const init = async () => {
      await git.whenReady();
      if (!cancelled) {
        await fetchStats();
      }
    };
    init();

    // Subscribe to git status changes (immediate, pass event for direct access)
    const cleanupGitStatus = git.onStatusChanged((event) => {
      if (!cancelled) {
        fetchStats(event);
      }
    });

    // Subscribe to file content changes (debounced)
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
  }, [git, fs, fetchStats, debouncedFetchStats, skip]);
}
