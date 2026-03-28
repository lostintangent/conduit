/**
 * Staging helpers for editor v2.
 *
 * Utilities for handling git staging operations, including
 * filtering out files with unsaved changes.
 */

import { enqueueNotification } from "@/store/actions/notifications";

/**
 * Result of filtering files for staging.
 */
export interface FilterDirtyFilesResult<T> {
  /** Files that are clean (no unsaved changes) and can be staged */
  cleanFiles: T[];
  /** Whether all files were dirty (none can be staged) */
  allDirty: boolean;
  /** Number of files that were skipped due to being dirty */
  skippedCount: number;
}

/**
 * Filter files for staging, removing any with unsaved changes.
 *
 * Shows appropriate toast notifications:
 * - If all files are dirty: shows "Cannot stage" message
 * - If some files are dirty: shows "Skipped X files" message
 *
 * @param files - Array of files to filter
 * @param getFilePath - Function to extract the full file path from a file entry
 * @param isFileDirty - Optional function to check if a file has unsaved changes
 * @returns FilterDirtyFilesResult with clean files and metadata
 */
export function filterDirtyFilesForStaging<T>(
  files: T[],
  getFilePath: (file: T) => string,
  isFileDirty?: (filePath: string) => boolean,
): FilterDirtyFilesResult<T> {
  if (!isFileDirty || files.length === 0) {
    return {
      cleanFiles: files,
      allDirty: false,
      skippedCount: 0,
    };
  }

  const cleanFiles = files.filter((file) => !isFileDirty(getFilePath(file)));
  const skippedCount = files.length - cleanFiles.length;
  const allDirty = cleanFiles.length === 0 && files.length > 0;

  return {
    cleanFiles,
    allDirty,
    skippedCount,
  };
}

/**
 * Show notification for dirty files that were skipped during staging.
 *
 * @param skippedCount - Number of files that were skipped
 * @param allDirty - Whether all files were dirty
 */
export function notifyDirtyFilesSkipped(
  skippedCount: number,
  allDirty: boolean,
): void {
  if (skippedCount === 0) return;

  if (allDirty) {
    enqueueNotification({
      kind: "info",
      message: "Cannot stage files with unsaved changes",
      details: "Save your changes before staging.",
    });
  } else {
    enqueueNotification({
      kind: "info",
      message: `Skipped ${skippedCount} file${skippedCount > 1 ? "s" : ""} with unsaved changes`,
      details: "Save your changes before staging.",
    });
  }
}

/**
 * Check if a single file can be staged (doesn't have unsaved changes).
 * Shows a notification if the file is dirty.
 *
 * @param filePath - The file path to check
 * @param isFileDirty - Optional function to check if a file has unsaved changes
 * @returns true if the file can be staged, false if it's dirty
 */
export function canStageFile(
  filePath: string,
  isFileDirty?: (filePath: string) => boolean,
): boolean {
  if (!isFileDirty) return true;

  if (isFileDirty(filePath)) {
    enqueueNotification({
      kind: "info",
      message: "Cannot stage file with unsaved changes",
      details: "Save your changes before staging.",
    });
    return false;
  }

  return true;
}
