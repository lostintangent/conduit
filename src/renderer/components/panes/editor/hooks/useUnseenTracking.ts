/**
 * useUnseenTracking Hook
 *
 * Consolidated hook for tracking unseen file changes in the editor.
 * Combines state management, subscriptions, and read triggers into a single API.
 *
 * This hook:
 * - Tracks which files have unseen changes (via useFileChangeTracking)
 * - Provides typed read triggers to mark files as seen (via useReadTriggers)
 * - Subscribes to git status changes to detect new files
 * - Subscribes to filesystem changes to detect content modifications
 * - Automatically excludes the currently open file from being marked unseen
 *
 * @example
 * ```tsx
 * function EditorPane({ git, cwd }) {
 *   const [selectedFile, setSelectedFile] = useState(null);
 *
 *   const unseenTracking = useUnseenTracking({
 *     git,
 *     cwd,
 *     enabled: true,
 *     currentlyOpenFile: selectedFile?.path,
 *     gitChangedFiles,
 *   });
 *
 *   // Mark file as seen when selected
 *   const handleSelect = (file) => {
 *     setSelectedFile(file);
 *     unseenTracking.triggerRead('file:select', file.path);
 *   };
 *
 *   // Pass to child components
 *   return (
 *     <FileTree
 *       isFileUnseen={unseenTracking.isUnseen}
 *       triggerRead={unseenTracking.triggerRead}
 *     />
 *   );
 * }
 * ```
 */

import type { GitV2API } from "@/api/GitV2API";
import { FileSystemV2APIService } from "@/services/FileSystemV2APIService";
import { normalizePathForKey } from "@/utils/pathUtils";
import { useEffect, useRef } from "react";
import {
  DISABLED_TRACKING,
  useFileChangeTracking,
  type FileChangeTrackingResult,
} from "./useFileChangeTracking";
import { useReadTriggers, type ReadTriggerAction } from "./useReadTriggers";

export interface UseUnseenTrackingOptions {
  /** Git API instance */
  git: GitV2API;

  /** Working directory (absolute path) */
  cwd: string;

  /** Whether unseen tracking is enabled (from user settings) */
  enabled: boolean;

  /**
   * Currently open file path (relative to cwd).
   * This file will be excluded from being marked as unseen,
   * since the user is already looking at it.
   */
  currentlyOpenFile: string | null;

  /**
   * Set of file paths currently in git status (relative to cwd).
   * Used to filter filesystem changes to only tracked files.
   */
  gitChangedFiles: Set<string>;
}

export interface UnseenTrackingResult {
  /**
   * Check if a file has unseen changes.
   */
  isUnseen: (path: string) => boolean;

  /**
   * Get the modification timestamp for a file.
   */
  getTimestamp: (path: string) => number | null;

  /**
   * Trigger a read action for a file, marking it as seen.
   * Use typed actions for self-documenting code.
   */
  triggerRead: (action: ReadTriggerAction, path: string) => void;

  /**
   * Mark all files as seen at once.
   */
  markAllSeen: () => void;

  /**
   * Get count of unseen files (optionally filtered by paths).
   */
  getUnseenCount: (paths?: string[]) => number;

  /**
   * Total count of unseen files.
   */
  unseenCount: number;

  /**
   * Sort files by modification timestamp (most recent first).
   */
  sortByTimestamp: <T extends [string, unknown]>(files: T[]) => T[];

  /**
   * Handle a path rename by transferring seen status from old paths to new paths.
   * Works for both files and folders. For folders, transfers status for all nested files.
   */
  handlePathRename: (oldPath: string, newPath: string) => void;

  /**
   * The underlying tracking result (for passing to child components).
   * Includes all FileChangeTrackingResult methods.
   */
  tracking: FileChangeTrackingResult;
}

/**
 * Disabled tracking result - use when tracking is disabled.
 */
export const DISABLED_UNSEEN_TRACKING: UnseenTrackingResult = {
  isUnseen: () => false,
  getTimestamp: () => null,
  triggerRead: () => {},
  markAllSeen: () => {},
  getUnseenCount: () => 0,
  unseenCount: 0,
  sortByTimestamp: <T extends [string, unknown]>(files: T[]): T[] => files,
  handlePathRename: () => {},
  tracking: DISABLED_TRACKING,
};

/**
 * Consolidated hook for unseen file change tracking.
 *
 * Manages all aspects of unseen tracking:
 * - Core state (which files are unseen)
 * - Subscriptions (git status, filesystem watcher)
 * - Read triggers (marking files as seen)
 * - Currently open file exclusion
 */
export function useUnseenTracking({
  git,
  cwd,
  enabled,
  currentlyOpenFile,
  gitChangedFiles,
}: UseUnseenTrackingOptions): UnseenTrackingResult {
  // Core tracking state
  const tracking = useFileChangeTracking();

  // Read triggers for marking files as seen
  const { triggerRead } = useReadTriggers(
    enabled ? tracking.markSeen : undefined,
  );

  // Use refs for values that shouldn't trigger resubscription
  // This prevents the subscription from being torn down and recreated
  // every time the user selects a different file
  const currentlyOpenFileRef = useRef(currentlyOpenFile);
  const gitChangedFilesRef = useRef(gitChangedFiles);

  // Keep refs in sync
  useEffect(() => {
    currentlyOpenFileRef.current = currentlyOpenFile;
  }, [currentlyOpenFile]);

  useEffect(() => {
    gitChangedFilesRef.current = gitChangedFiles;
  }, [gitChangedFiles]);

  // ---------------------------------------------------------------------------
  // Git Status Subscription
  // ---------------------------------------------------------------------------

  // Use the stable processStatusChange callback directly to avoid subscription churn.
  // tracking.processStatusChange has [] deps so it's stable across renders.
  const { processStatusChange } = tracking;

  useEffect(() => {
    if (!enabled) return;

    const cleanup = git.onStatusChanged((event) => {
      // Mark newly added files as unseen
      // We only process event.added, not event.modified, because:
      // - Modified includes staging state changes (stage/unstage)
      // - Actual content changes are handled by the filesystem watcher
      if (event.added.length > 0) {
        // Filter out the currently open file - user is already looking at it
        const openFile = currentlyOpenFileRef.current;
        const filesToMark = openFile
          ? event.added.filter((path) => path !== openFile)
          : event.added;

        if (filesToMark.length > 0) {
          processStatusChange(filesToMark);
        }
      }
    });

    return cleanup;
  }, [git, enabled, processStatusChange]);

  // ---------------------------------------------------------------------------
  // Filesystem Watcher Subscription
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!enabled || !cwd) return;

    let fsApi: ReturnType<typeof FileSystemV2APIService.getInstance> | null =
      null;
    let cleanup: (() => void) | null = null;

    try {
      fsApi = FileSystemV2APIService.getInstance();
      const api = fsApi.acquire(cwd);

      // Subscribe to all file content changes in this cwd
      cleanup = api.onAnyFileContentChanged((fullPath: string) => {
        // Convert full path to relative path from cwd
        // Use case-insensitive comparison on macOS/Windows
        const cwdWithSlash = cwd.endsWith("/") ? cwd : cwd + "/";
        const normalizedFullPath = normalizePathForKey(fullPath);
        const normalizedCwdWithSlash = normalizePathForKey(cwdWithSlash);

        if (!normalizedFullPath.startsWith(normalizedCwdWithSlash)) return;

        // Extract relative path - use the normalized prefix length for correct slicing
        const relativePath = fullPath.slice(cwdWithSlash.length);
        const normalizedRelativePath = normalizePathForKey(relativePath);

        // Use normalized paths for comparisons
        const normalizedOpenFile = currentlyOpenFileRef.current
          ? normalizePathForKey(currentlyOpenFileRef.current)
          : null;
        const isCurrentlyOpen = normalizedRelativePath === normalizedOpenFile;

        // Skip if this is the currently open file - user is already looking at it
        if (isCurrentlyOpen) return;

        // Find matching path in gitChangedFiles (case-insensitive on macOS/Windows)
        // We need to find the original path from git to pass to processStatusChange
        let matchedGitPath: string | null = null;
        for (const gitPath of gitChangedFilesRef.current) {
          if (normalizePathForKey(gitPath) === normalizedRelativePath) {
            matchedGitPath = gitPath;
            break;
          }
        }

        // Only process if it's a file we're tracking (in git status)
        if (matchedGitPath) {
          processStatusChange([matchedGitPath]);
        }
      });
    } catch {
      // FileSystemV2API not available (e.g., in test environment)
    }

    return () => {
      cleanup?.();
      if (fsApi) {
        fsApi.release(cwd);
      }
    };
  }, [cwd, enabled, processStatusChange]);

  // ---------------------------------------------------------------------------
  // Return API
  // ---------------------------------------------------------------------------

  if (!enabled) {
    return DISABLED_UNSEEN_TRACKING;
  }

  return {
    isUnseen: tracking.isUnseen,
    getTimestamp: tracking.getTimestamp,
    triggerRead,
    markAllSeen: tracking.markAllSeen,
    getUnseenCount: tracking.getUnseenCount,
    unseenCount: tracking.unseenCount,
    sortByTimestamp: tracking.sortByTimestamp,
    handlePathRename: tracking.handlePathRename,
    tracking,
  };
}
