/**
 * useFollowMode Hook
 *
 * Manages "Follow mode" state for the changes review pane - an inbox-style
 * view where files are ordered by modification time with unread indicators.
 *
 * Features:
 * - Track modification timestamps for each file
 * - Track "unseen" state (files with changes the user hasn't acknowledged)
 * - Sort files by modification time (most recent first)
 * - Clear unseen state on interaction (collapse, stage, click, etc.)
 * - Provide unseen counts for sections and total
 *
 * Design Philosophy:
 * - Files start as "seen" when first loaded
 * - When a file changes (via git status event), it becomes "unseen"
 * - Any interaction with a file marks it as "seen"
 * - Timestamps are preserved across re-renders
 *
 * @example
 * ```tsx
 * function ReviewPane({ git }) {
 *   const {
 *     isUnseen,
 *     getTimestamp,
 *     markSeen,
 *     markAllSeen,
 *     unseenCount,
 *     sortByTimestamp,
 *     processStatusChange,
 *   } = useFollowMode();
 *
 *   // Process git status changes
 *   useEffect(() => {
 *     return git.onStatusChanged((event) => {
 *       processStatusChange(event.added, event.modified);
 *     });
 *   }, [git, processStatusChange]);
 *
 *   // Sort files by timestamp
 *   const sortedFiles = sortByTimestamp(files);
 *
 *   return (
 *     <div>
 *       <header>
 *         Changes ({unseenCount} new)
 *         <button onClick={markAllSeen}>Mark all seen</button>
 *       </header>
 *       {sortedFiles.map(file => (
 *         <FileItem
 *           key={file}
 *           unseen={isUnseen(file)}
 *           timestamp={getTimestamp(file)}
 *           onInteract={() => markSeen(file)}
 *         />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */

import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Metadata tracked for each file in Follow mode.
 */
interface FileMetadata {
  /** Timestamp when the file was last modified (ms since epoch), or null if unknown */
  timestamp: number | null;
  /** Whether the user has "seen" (interacted with) this file since last change */
  seen: boolean;
}

/**
 * Return type for useFollowMode hook.
 */
export interface UseFollowModeResult {
  /**
   * Check if a file is unseen (has unacknowledged changes).
   */
  isUnseen: (path: string) => boolean;

  /**
   * Get the modification timestamp for a file.
   * Returns null if file hasn't been tracked yet.
   */
  getTimestamp: (path: string) => number | null;

  /**
   * Mark a file as seen (user has acknowledged its changes).
   * Call this when user collapses, stages, clicks, or otherwise interacts with a file.
   */
  markSeen: (path: string) => void;

  /**
   * Mark all files as seen at once.
   */
  markAllSeen: () => void;

  /**
   * Get count of unseen files (optionally filtered by a list of paths).
   */
  getUnseenCount: (paths?: string[]) => number;

  /**
   * Total count of unseen files across all tracked files.
   */
  unseenCount: number;

  /**
   * Sort files by modification timestamp (most recent first).
   * Files without timestamps are sorted to the end alphabetically.
   */
  sortByTimestamp: <T extends [string, unknown]>(files: T[]) => T[];

  /**
   * Process a git status change event.
   * Call this when git status changes to update timestamps and unseen state.
   *
   * @param addedOrModified - Paths that were added or modified
   * @param expandFile - Optional callback to auto-expand files that become unseen
   */
  processStatusChange: (
    addedOrModified: string[],
    expandFile?: (path: string) => void,
  ) => void;

  /**
   * Initialize tracking for files without marking them unseen.
   * Call this on initial load to set timestamps for existing files.
   */
  initializeFiles: (paths: string[]) => void;

  /**
   * Clear all tracking data.
   */
  reset: () => void;
}

/**
 * Hook for managing Follow mode state in the changes review pane.
 *
 * @returns Follow mode state and control functions
 */
export function useFollowMode(): UseFollowModeResult {
  // Map of file paths to their metadata
  const [fileMetadata, setFileMetadata] = useState<Map<string, FileMetadata>>(
    () => new Map(),
  );

  // Track if we've done initial load (to avoid marking all files as unseen on mount)
  const hasInitializedRef = useRef(false);

  /**
   * Check if a file is unseen.
   */
  const isUnseen = useCallback(
    (path: string): boolean => {
      const metadata = fileMetadata.get(path);
      return metadata ? !metadata.seen : false;
    },
    [fileMetadata],
  );

  /**
   * Get timestamp for a file.
   */
  const getTimestamp = useCallback(
    (path: string): number | null => {
      const metadata = fileMetadata.get(path);
      return metadata?.timestamp ?? null;
    },
    [fileMetadata],
  );

  /**
   * Mark a single file as seen.
   */
  const markSeen = useCallback((path: string) => {
    setFileMetadata((prev) => {
      const metadata = prev.get(path);
      if (!metadata || metadata.seen) return prev;

      const next = new Map(prev);
      next.set(path, { ...metadata, seen: true });
      return next;
    });
  }, []);

  /**
   * Mark all files as seen.
   */
  const markAllSeen = useCallback(() => {
    setFileMetadata((prev) => {
      let hasChanges = false;
      const next = new Map(prev);

      for (const [path, metadata] of next) {
        if (!metadata.seen) {
          next.set(path, { ...metadata, seen: true });
          hasChanges = true;
        }
      }

      return hasChanges ? next : prev;
    });
  }, []);

  /**
   * Get count of unseen files.
   */
  const getUnseenCount = useCallback(
    (paths?: string[]): number => {
      if (paths) {
        return paths.filter((path) => {
          const metadata = fileMetadata.get(path);
          return metadata && !metadata.seen;
        }).length;
      }

      let count = 0;
      for (const metadata of fileMetadata.values()) {
        if (!metadata.seen) count++;
      }
      return count;
    },
    [fileMetadata],
  );

  /**
   * Total unseen count.
   */
  const unseenCount = useMemo(() => getUnseenCount(), [getUnseenCount]);

  /**
   * Sort files by timestamp (most recent first).
   * Files without timestamps are sorted to the end, alphabetically.
   */
  const sortByTimestamp = useCallback(
    <T extends [string, unknown]>(files: T[]): T[] => {
      return [...files].sort((a, b) => {
        const timeA = fileMetadata.get(a[0])?.timestamp ?? null;
        const timeB = fileMetadata.get(b[0])?.timestamp ?? null;

        // Files without timestamps go to the end
        if (timeA === null && timeB === null) {
          return a[0].localeCompare(b[0]);
        }
        if (timeA === null) return 1;
        if (timeB === null) return -1;

        // Sort by timestamp descending (most recent first)
        if (timeA !== timeB) {
          return timeB - timeA;
        }

        // Fall back to alphabetical for same timestamp
        return a[0].localeCompare(b[0]);
      });
    },
    [fileMetadata],
  );

  /**
   * Process git status change - update timestamps and mark files as unseen.
   */
  const processStatusChange = useCallback(
    (addedOrModified: string[], expandFile?: (path: string) => void) => {
      if (addedOrModified.length === 0) return;

      const now = Date.now();

      setFileMetadata((prev) => {
        const next = new Map(prev);

        for (const path of addedOrModified) {
          const existing = next.get(path);

          // Mark as unseen and update timestamp
          next.set(path, {
            timestamp: now,
            seen: false,
          });

          // If file was previously collapsed (seen), expand it
          if (existing?.seen && expandFile) {
            expandFile(path);
          }
        }

        return next;
      });
    },
    [],
  );

  /**
   * Initialize files without marking them as unseen.
   * Used on initial load.
   *
   * @param paths - File paths to initialize
   * @param timestamps - Optional map of path -> mtime for initial file timestamps
   */
  const initializeFiles = useCallback(
    (paths: string[], timestamps?: Map<string, number>) => {
      if (hasInitializedRef.current) return;
      hasInitializedRef.current = true;

      setFileMetadata((prev) => {
        const next = new Map(prev);

        for (const path of paths) {
          if (!next.has(path)) {
            next.set(path, {
              timestamp: timestamps?.get(path) ?? null,
              seen: true, // Start as seen on initial load
            });
          }
        }

        return next;
      });
    },
    [],
  );

  /**
   * Reset all tracking data.
   */
  const reset = useCallback(() => {
    setFileMetadata(new Map());
    hasInitializedRef.current = false;
  }, []);

  return {
    isUnseen,
    getTimestamp,
    markSeen,
    markAllSeen,
    getUnseenCount,
    unseenCount,
    sortByTimestamp,
    processStatusChange,
    initializeFiles,
    reset,
  };
}
