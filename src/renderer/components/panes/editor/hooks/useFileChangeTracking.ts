/**
 * useFileChangeTracking Hook
 *
 * Manages file change tracking state for the editor - tracking which files
 * have been modified externally and haven't been reviewed by the user yet.
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
 *   } = useFileChangeTracking();
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
 * Metadata tracked for each file.
 */
interface FileMetadata {
  /** Timestamp when the file was last modified (ms since epoch), or null if unknown */
  timestamp: number | null;
  /** Whether the user has "seen" (interacted with) this file since last change */
  seen: boolean;
}

/**
 * Return type for useFileChangeTracking hook.
 */
export interface FileChangeTrackingResult {
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
  initializeFiles: (paths: string[], timestamps?: Map<string, number>) => void;

  /**
   * Clear all tracking data.
   */
  reset: () => void;

  /**
   * Handle a path rename by transferring seen status from old paths to new paths.
   * Works for both files and folders. For folders, transfers status for all nested files.
   *
   * @param oldPath - Old path (file or folder)
   * @param newPath - New path (file or folder)
   */
  handlePathRename: (oldPath: string, newPath: string) => void;
}

/**
 * Disabled tracking implementation - all no-op functions.
 * Use this when tracking is disabled via settings.
 */
export const DISABLED_TRACKING: FileChangeTrackingResult = {
  isUnseen: () => false,
  getTimestamp: () => null,
  markSeen: () => {},
  markAllSeen: () => {},
  getUnseenCount: () => 0,
  unseenCount: 0,
  sortByTimestamp: <T extends [string, unknown]>(files: T[]): T[] => files,
  processStatusChange: () => {},
  initializeFiles: () => {},
  reset: () => {},
  handlePathRename: () => {},
};

/**
 * Hook for managing file change tracking state in the editor.
 *
 * @returns File change tracking state and control functions
 */
export function useFileChangeTracking(): FileChangeTrackingResult {
  // Map of file paths to their metadata
  const [fileMetadata, setFileMetadata] = useState<Map<string, FileMetadata>>(
    () => new Map(),
  );

  // Track if we've done initial load (to avoid marking all files as unseen on mount)
  const hasInitializedRef = useRef(false);

  // Track paths that should be ignored due to recent rename operations
  // This prevents marking files as unseen when they're just being renamed
  const renameGracePaths = useRef<Set<string>>(new Set());

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

      // Filter out paths that are in the rename grace period
      const gracePaths = renameGracePaths.current;
      const pathsToProcess = addedOrModified.filter((path) => {
        // Check if this path matches any grace prefix (folder rename)
        for (const gracePrefix of gracePaths) {
          if (path === gracePrefix || path.startsWith(gracePrefix + "/")) {
            return false;
          }
        }
        return true;
      });

      if (pathsToProcess.length === 0) {
        return;
      }

      const now = Date.now();

      setFileMetadata((prev) => {
        const next = new Map(prev);

        for (const path of pathsToProcess) {
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

  /**
   * Handle a path rename by transferring metadata from old paths to new paths.
   * Works for both files and folders. For folders, transfers status for all nested files.
   *
   * IMPORTANT: Due to race conditions, git status may fire `added` events for the
   * new paths BEFORE or AFTER this function runs. We handle this by:
   * 1. Adding the new path to a "grace period" set that blocks processStatusChange
   * 2. Transferring any existing metadata from old paths to new paths
   * 3. Clearing the grace period after a short delay
   */
  const handlePathRename = useCallback(
    (oldPrefix: string, newPrefix: string) => {
      // Add the new prefix to grace paths BEFORE doing anything else
      // This prevents any processStatusChange calls from marking new paths as unseen
      renameGracePaths.current.add(newPrefix);

      // Clear the grace period after a delay (give git status time to settle)
      setTimeout(() => {
        renameGracePaths.current.delete(newPrefix);
      }, 500);

      setFileMetadata((prev) => {
        // First pass: collect transfers from old paths to new paths
        // These take PRIORITY over any existing entries at the new paths
        const transfers = new Map<string, FileMetadata>();
        for (const [path, metadata] of prev) {
          if (path === oldPrefix || path.startsWith(oldPrefix + "/")) {
            const newPath =
              path === oldPrefix
                ? newPrefix
                : newPrefix + path.slice(oldPrefix.length);
            transfers.set(newPath, metadata);
          }
        }

        if (transfers.size === 0) {
          return prev;
        }

        // Second pass: build new map
        // - Skip old prefix paths (they're being transferred)
        // - For new prefix paths, use transferred metadata (priority) or keep existing
        // - Keep all other paths as-is
        const next = new Map<string, FileMetadata>();
        for (const [path, metadata] of prev) {
          if (path === oldPrefix || path.startsWith(oldPrefix + "/")) {
            // Skip old paths - they're being transferred
            continue;
          }
          const transferred = transfers.get(path);
          if (transferred !== undefined) {
            // This path matches a transfer target - use the transferred metadata
            // (handles race condition where git added new path before rename completed)
            next.set(path, transferred);
            transfers.delete(path); // Mark as handled
          } else {
            // Keep other paths as-is
            next.set(path, metadata);
          }
        }

        // Add any remaining transfers (new paths that weren't in the map yet)
        for (const [newPath, metadata] of transfers) {
          next.set(newPath, metadata);
        }

        return next;
      });
    },
    [],
  );

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
    handlePathRename,
  };
}
