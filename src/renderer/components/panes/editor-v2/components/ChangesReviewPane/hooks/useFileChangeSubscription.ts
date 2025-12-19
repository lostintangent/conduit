/**
 * useFileChangeSubscription Hook
 *
 * Subscribes to file change events and feeds them into the file change tracking system.
 * Handles three sources of change events:
 *
 * 1. Initial load - Fetches file modification times and initializes tracking
 * 2. Git status changes - Detects newly added files
 * 3. Filesystem changes - Detects content modifications to existing files
 *
 * This hook colocates all the "listening for changes" logic that feeds into
 * the useFileChangeTracking hook's processStatusChange and initializeFiles functions.
 *
 * @example
 * ```tsx
 * function ChangesReviewPane({ git, cwd, fileTracking }) {
 *   const { expandFile } = useExpandedFiles(allFilePaths);
 *
 *   useFileChangeSubscription({
 *     git,
 *     cwd,
 *     allFilePaths,
 *     isLoading,
 *     processStatusChange: fileTracking.processStatusChange,
 *     initializeFiles: fileTracking.initializeFiles,
 *     expandFile,
 *     onStatusChanged: setGitStatus,
 *   });
 * }
 * ```
 */

import type { GitStatus } from "@/../../src/ipc/gitv2/types";
import type { GitV2API } from "@/api/GitV2API";
import { FileSystemV2APIService } from "@/services/FileSystemV2APIService";
import { useEffect } from "react";

export interface UseFileChangeSubscriptionOptions {
  /** Git API instance */
  git: GitV2API;

  /** Working directory */
  cwd: string;

  /** Optional sandbox ID for cloud VM operations */
  sandboxId?: string;

  /** All file paths currently in git status */
  allFilePaths: string[];

  /** Whether initial git status is still loading */
  isLoading: boolean;

  /** Callback to process file changes (from useFileChangeTracking) */
  processStatusChange: (
    paths: string[],
    expandFile?: (path: string) => void,
  ) => void;

  /** Callback to initialize file tracking (from useFileChangeTracking) */
  initializeFiles: (paths: string[], timestamps?: Map<string, number>) => void;

  /** Callback to expand a file in the UI */
  expandFile: (path: string) => void;

  /** Callback when git status changes */
  onStatusChanged: (status: GitStatus) => void;
}

/**
 * Subscribes to file change events and feeds them into the tracking system.
 *
 * Sets up three subscriptions:
 * 1. Initializes tracking with file modification timestamps on first load
 * 2. Subscribes to git status changes to detect new files
 * 3. Subscribes to filesystem changes to detect content modifications
 */
export function useFileChangeSubscription({
  git,
  cwd,
  sandboxId,
  allFilePaths,
  isLoading,
  processStatusChange,
  initializeFiles,
  expandFile,
  onStatusChanged,
}: UseFileChangeSubscriptionOptions): void {
  // ---------------------------------------------------------------------------
  // Initialize Files on Initial Load
  // ---------------------------------------------------------------------------

  // Initialize tracking for existing files (marks them as "seen")
  // Fetches actual file modification times for proper sorting
  useEffect(() => {
    if (isLoading || allFilePaths.length === 0) return;

    let cancelled = false;

    async function initWithTimestamps() {
      try {
        // Fetch actual file modification times from git
        const filesWithTimes = await git.getDirtyFilesWithTimes();

        if (cancelled) return;

        // Convert to Map for O(1) lookups
        const timestampMap = new Map<string, number>();
        for (const { path, mtime } of filesWithTimes) {
          timestampMap.set(path, mtime);
        }

        initializeFiles(allFilePaths, timestampMap);
      } catch (error) {
        console.error(
          "[useFileChangeSubscription] Failed to get file timestamps:",
          error,
        );
        // Fall back to initializing without timestamps
        if (!cancelled) {
          initializeFiles(allFilePaths);
        }
      }
    }

    initWithTimestamps();

    return () => {
      cancelled = true;
    };
  }, [isLoading, allFilePaths, initializeFiles, git]);

  // ---------------------------------------------------------------------------
  // Git Status Subscription
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const cleanup = git.onStatusChanged((event) => {
      onStatusChanged(event.status);

      // Process tracking: only mark truly NEW files as unseen (and auto-expand).
      // We intentionally ignore event.modified here because it includes staging
      // state changes (stage/unstage), which shouldn't update timestamps.
      // Actual content changes to existing files are handled by the filesystem watcher.
      if (event.added.length > 0) {
        processStatusChange(event.added, expandFile);
      }
    });

    return cleanup;
  }, [git, processStatusChange, expandFile, onStatusChanged]);

  // ---------------------------------------------------------------------------
  // External File Change Subscription
  // ---------------------------------------------------------------------------

  // Subscribe to filesystem changes to detect when files are modified.
  // This catches file edits that don't change git status (file is already "modified").
  // Works for both expanded files (with Monaco editors) and collapsed files.
  useEffect(() => {
    let fsApi: ReturnType<typeof FileSystemV2APIService.getInstance> | null =
      null;
    let cleanup: (() => void) | null = null;

    try {
      // Acquire a FileSystemV2API instance for our cwd
      fsApi = FileSystemV2APIService.getInstance();
      const api = fsApi.acquire(cwd, sandboxId);

      // Subscribe to ALL file content changes in this cwd
      cleanup = api.onAnyFileContentChanged((fullPath: string) => {
        // Convert full path to relative path from cwd
        const cwdWithSlash = cwd.endsWith("/") ? cwd : cwd + "/";
        if (!fullPath.startsWith(cwdWithSlash)) return;

        const relativePath = fullPath.slice(cwdWithSlash.length);

        // Only process if it's a file we're tracking (in our git status)
        if (allFilePaths.includes(relativePath)) {
          processStatusChange([relativePath], expandFile);
        }
      });
    } catch {
      // FileSystemV2API not available (e.g., in test environment)
    }

    return () => {
      cleanup?.();
      if (fsApi) {
        // Release the FileSystemV2API instance
        fsApi.release(cwd, sandboxId);
      }
    };
  }, [cwd, sandboxId, allFilePaths, processStatusChange, expandFile]);
}
