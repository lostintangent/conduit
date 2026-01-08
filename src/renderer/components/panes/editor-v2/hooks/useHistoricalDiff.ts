/**
 * useHistoricalDiff Hook
 *
 * Provides content for viewing a historical file diff between two commits.
 * Both original and modified content come from git history (read-only).
 *
 * This hook is specifically designed for viewing diffs within commit history,
 * where both sides represent historical versions of a file, not the current
 * working directory state.
 *
 * @example
 * ```tsx
 * function HistoricalDiffViewer({ commitId, parentCommitId, filePath }: Props) {
 *   const diff = useHistoricalDiff(commitId, parentCommitId, filePath, git);
 *
 *   if (diff.isLoading) return <Loading />;
 *   if (diff.error) return <Error message={diff.error.message} />;
 *
 *   return (
 *     <MonacoDiffEditor
 *       original={diff.original}
 *       modified={diff.modified}
 *       readOnly
 *     />
 *   );
 * }
 * ```
 */

import { useEffect, useState, useRef } from "react";
import type { GitV2API } from "@/api/GitV2API";
import { isBinaryContent } from "../utils";

// ============================================================================
// Error Types
// ============================================================================

/**
 * Specific error types for historical diff content loading.
 */
export type HistoricalDiffErrorType =
  | "commit_not_found" // Commit doesn't exist
  | "file_not_in_commit" // File doesn't exist in the commit
  | "binary_file" // File appears to be binary
  | "unknown"; // Other/unexpected error

/**
 * Structured error information for historical diff loading failures.
 */
export interface HistoricalDiffError {
  /** The type of error for programmatic handling */
  type: HistoricalDiffErrorType;

  /** Human-readable error message */
  message: string;
}

/**
 * Result returned by useHistoricalDiff hook.
 */
export interface HistoricalDiffContent {
  /** Original content from parent commit (left side of diff) */
  original: string | null;

  /** Modified content from the commit (right side of diff) */
  modified: string | null;

  /** Whether content is currently being loaded */
  isLoading: boolean;

  /** Structured error information if loading failed */
  error: HistoricalDiffError | null;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create a HistoricalDiffError from an error object and context.
 */
function createHistoricalDiffError(
  error: unknown,
  commitId: string,
  filePath: string,
): HistoricalDiffError {
  const originalMessage =
    error instanceof Error ? error.message : String(error);
  const errorMsg = originalMessage.toLowerCase();

  // Binary file
  if (errorMsg.includes("binary")) {
    return {
      type: "binary_file",
      message: `File "${filePath}" appears to be a binary file`,
    };
  }

  // Commit not found
  if (
    errorMsg.includes("bad revision") ||
    errorMsg.includes("unknown revision") ||
    errorMsg.includes("ambiguous argument")
  ) {
    return {
      type: "commit_not_found",
      message: `Commit "${commitId}" not found`,
    };
  }

  // File not in commit
  if (
    errorMsg.includes("does not exist") ||
    errorMsg.includes("did not match") ||
    errorMsg.includes("pathspec")
  ) {
    return {
      type: "file_not_in_commit",
      message: `File "${filePath}" does not exist in commit ${commitId.slice(0, 7)}`,
    };
  }

  // Unknown error
  return {
    type: "unknown",
    message: originalMessage || "Failed to load historical diff content",
  };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to get historical diff content for a file between two commits.
 *
 * Fetches file content at both the commit and its parent to show the
 * changes introduced by that commit. Both sides are read-only since
 * they represent historical versions.
 *
 * @param commitId - The commit containing the change (right side)
 * @param parentCommitId - The parent commit (left side)
 * @param filePath - Relative path to the file from git root
 * @param git - GitV2API instance for fetching content
 * @param originalFilePath - Original path for renamed/copied files (used for parent commit)
 * @returns HistoricalDiffContent with original, modified, loading state, and error
 */
export function useHistoricalDiff(
  commitId: string | null,
  parentCommitId: string | null,
  filePath: string | null,
  git: GitV2API,
  originalFilePath?: string | null,
): HistoricalDiffContent {
  const [state, setState] = useState<HistoricalDiffContent>({
    original: null,
    modified: null,
    isLoading: commitId !== null && filePath !== null,
    error: null,
  });

  // Track mounted state to avoid state updates after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // If no commit or file path, reset state
    if (commitId === null || filePath === null) {
      setState({
        original: null,
        modified: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    // Track if this specific effect instance is still current
    let isStale = false;

    // Start loading
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    const loadContent = async () => {
      let originalContent: string | null = null;
      let modifiedContent: string | null = null;
      let diffError: HistoricalDiffError | null = null;

      // 1. Fetch modified content from the commit (right side)
      try {
        modifiedContent = await git.getFileAtCommit(commitId, filePath);
      } catch (error) {
        diffError = createHistoricalDiffError(error, commitId, filePath);
      }

      if (isStale) return;

      // 2. Check for binary content in modified
      if (modifiedContent !== null && isBinaryContent(modifiedContent)) {
        diffError = {
          type: "binary_file",
          message: `File "${filePath}" appears to be a binary file`,
        };
        modifiedContent = null;
      }

      // 3. Fetch original content from parent commit (left side)
      // Only if we don't have an error yet and have a parent commit
      // For renamed/copied files, use originalFilePath to find the file in parent
      if (diffError === null && parentCommitId) {
        const parentPath = originalFilePath || filePath;
        try {
          originalContent = await git.getFileAtCommit(
            parentCommitId,
            parentPath,
          );
        } catch {
          // File might not exist in parent (new file added in this commit)
          // This is not an error - show empty original
          originalContent = "";
        }

        if (isStale) return;

        // 4. Check for binary content in original
        if (originalContent !== null && isBinaryContent(originalContent)) {
          diffError = {
            type: "binary_file",
            message: `File "${filePath}" appears to be a binary file`,
          };
          originalContent = null;
        }
      } else if (diffError === null && !parentCommitId) {
        // No parent commit (initial commit) - show empty original
        originalContent = "";
      }

      // 5. Handle deleted files (file exists in parent but not in commit)
      // If we got null for modified but no error, the file was deleted
      if (modifiedContent === null && diffError === null) {
        // File was deleted in this commit - show as deletion
        modifiedContent = "";
      }

      // Only update state if still mounted AND this effect is still current
      if (isMountedRef.current && !isStale) {
        setState({
          original: originalContent,
          modified: modifiedContent,
          isLoading: false,
          error: diffError,
        });
      }
    };

    loadContent().catch((error) => {
      console.error("Unexpected error loading historical diff content:", error);
      if (isMountedRef.current && !isStale) {
        setState({
          original: null,
          modified: null,
          isLoading: false,
          error: {
            type: "unknown",
            message:
              error instanceof Error
                ? error.message
                : "Failed to load historical diff",
          },
        });
      }
    });

    return () => {
      isStale = true;
    };
  }, [commitId, parentCommitId, filePath, git, originalFilePath]);

  return state;
}
