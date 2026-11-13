/**
 * useDiffContent Hook
 *
 * Provides the original and modified content for a diff view. Supports
 * configurable content sources for both sides of the diff.
 *
 * Content sources:
 * - 'head': Content from HEAD commit
 * - 'index': Content from git staging area
 * - 'workingDirectory': Content from filesystem (only valid for modified side)
 * - Any other string: Content from that git ref
 *
 * @example
 * ```tsx
 * // Staged changes: HEAD → Index
 * const diff = useDiffContent(filePath, cwd, {
 *   originalSource: 'head',
 *   modifiedSource: 'index',
 * });
 *
 * // Unstaged changes: HEAD → Working Directory
 * const diff = useDiffContent(filePath, cwd, {
 *   originalSource: 'head',
 *   modifiedSource: 'workingDirectory',
 * });
 *
 * // Partially staged: Index → Working Directory
 * const diff = useDiffContent(filePath, cwd, {
 *   originalSource: 'index',
 *   modifiedSource: 'workingDirectory',
 * });
 * ```
 */

import { useEffect, useRef, useState } from "react";
import { useGitV2 } from "../../../../hooks/useGitV2";
import { MonacoModelRegistry, createModelKey } from "../registry";
import { type ContentSource, contentSourceToGitRef } from "../types";
import { isBinaryContent } from "../utils";

// ============================================================================
// Error Types
// ============================================================================

/**
 * Specific error types for diff content loading.
 */
export type DiffErrorType =
  | "not_tracked" // File is not tracked by git (new file)
  | "not_committed" // File is tracked but has no committed version yet
  | "ref_not_found" // Git ref (branch/commit) doesn't exist
  | "binary_file" // File appears to be binary
  | "file_not_found" // File doesn't exist in working directory
  | "unknown"; // Other/unexpected error

/**
 * Structured error information for diff loading failures.
 */
export interface DiffError {
  /** The type of error for programmatic handling */
  type: DiffErrorType;

  /** Human-readable error message */
  message: string;
}

/**
 * Result returned by useDiffContent hook.
 */
export interface DiffContent {
  /** Original content from the original source */
  original: string | null;

  /** Modified content from the modified source */
  modified: string | null;

  /** Whether content is currently being loaded */
  isLoading: boolean;

  /** Structured error information if loading failed */
  error: DiffError | null;

  /** Legacy: Simple error message (for backwards compatibility) */
  errorMessage: string | null;

  /** Whether the modified side is editable (only true for workingDirectory) */
  isModifiedEditable: boolean;
}

/**
 * Options for useDiffContent hook.
 */
export interface UseDiffContentOptions {
  /** Source for original content (default: 'head') */
  originalSource?: ContentSource;

  /** Source for modified content (default: 'workingDirectory') */
  modifiedSource?: ContentSource;

  /**
   * For renamed/copied files, the original path before the rename.
   * When provided, this path is used to fetch content from originalSource,
   * while filePath is used for modifiedSource.
   */
  originalFilePath?: string;
}

/**
 * Create a DiffError from an error object and context.
 *
 * Uses a priority-ordered approach to classify errors:
 * 1. Binary file detection (most specific)
 * 2. Git ref/revision not found
 * 3. File not committed yet
 * 4. File not tracked in git
 * 5. Unknown error (fallback with original message)
 *
 * The order matters because some error messages may match multiple patterns.
 */
function createDiffError(
  error: unknown,
  ref: string,
  filePath: string,
): DiffError {
  const originalMessage =
    error instanceof Error ? error.message : String(error);
  const errorMsg = originalMessage.toLowerCase();

  // Priority 1: Binary file (most specific)
  if (errorMsg.includes("binary")) {
    return {
      type: "binary_file",
      message: `File "${filePath}" appears to be a binary file`,
    };
  }

  // Priority 2: Git ref/revision not found
  // Common git error patterns:
  // - "fatal: bad revision 'nonexistent'"
  // - "unknown revision or path not in the working tree"
  // - "ambiguous argument 'nonexistent': unknown revision"
  if (
    (errorMsg.includes("bad revision") ||
      errorMsg.includes("unknown revision") ||
      errorMsg.includes("ambiguous argument")) &&
    !errorMsg.includes("exists in index")
  ) {
    return {
      type: "ref_not_found",
      message: `Git ref "${ref}" not found`,
    };
  }

  // Priority 3: File exists but has no committed version
  // Git error: "fatal: path 'file' exists on disk, but not in 'HEAD'"
  if (errorMsg.includes("exists on disk") && errorMsg.includes("fatal")) {
    return {
      type: "not_committed",
      message: `File "${filePath}" has no committed version yet`,
    };
  }

  // Priority 4: File not tracked in git
  // Common git error patterns:
  // - "fatal: path 'file' does not exist in 'HEAD'"
  // - "error: pathspec 'file' did not match any file(s)"
  // - "fatal: Path 'file' does not exist"
  if (
    errorMsg.includes("does not exist") ||
    errorMsg.includes("did not match") ||
    (errorMsg.includes("pathspec") && errorMsg.includes("error"))
  ) {
    return {
      type: "not_tracked",
      message: `File "${filePath}" is not tracked in git at ${ref}`,
    };
  }

  // Priority 5: Unknown error - preserve the original error message
  // This ensures we don't lose important debugging information
  return {
    type: "unknown",
    message: originalMessage || "Failed to load diff content",
  };
}

export function useDiffContent(
  filePath: string | null,
  cwd: string,
  options: UseDiffContentOptions = {},
): DiffContent {
  const {
    originalSource = "head",
    modifiedSource = "workingDirectory",
    originalFilePath,
  } = options;

  // Determine if modified side is editable (only workingDirectory is editable)
  const isModifiedEditable = modifiedSource === "workingDirectory";

  const [state, setState] = useState<DiffContent>({
    original: null,
    modified: null,
    isLoading: filePath !== null,
    error: null,
    errorMessage: null,
    isModifiedEditable,
  });

  // Git API for fetching content from git sources
  const git = useGitV2(cwd);

  // Track mounted state to avoid state updates after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // If no file path, reset state
    if (filePath === null) {
      setState({
        original: null,
        modified: null,
        isLoading: false,
        error: null,
        errorMessage: null,
        isModifiedEditable,
      });
      return;
    }

    // Track if this specific effect instance is still current
    // This prevents race conditions when filePath changes rapidly
    let isStale = false;

    // Start loading
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      errorMessage: null,
    }));

    const loadContent = async () => {
      const registry = MonacoModelRegistry.getInstance();
      const modelKey = createModelKey(filePath);
      const originalRef = contentSourceToGitRef(originalSource);

      // For renamed files, use originalFilePath to fetch from original source
      const pathForOriginal = originalFilePath || filePath;

      let originalContent: string | null = null;
      let modifiedContent: string | null = null;
      let diffError: DiffError | null = null;

      // 1. Fetch original content from git
      try {
        originalContent = await git.getFileAtRef(pathForOriginal, originalRef);
      } catch (error) {
        // Create specific error for git fetch failure
        diffError = createDiffError(error, originalRef, pathForOriginal);
      }

      // Check if effect was cleaned up during async operation
      if (isStale) {
        return;
      }

      // 2. Check for binary content in original
      if (originalContent !== null && isBinaryContent(originalContent)) {
        diffError = {
          type: "binary_file",
          message: `File "${filePath}" appears to be a binary file`,
        };
        originalContent = null;
      }

      // 3. Get modified content based on source
      // Also load modified content for not_tracked and not_committed files
      // so we can show them as "added" in the diff
      if (
        diffError === null ||
        diffError.type === "not_tracked" ||
        diffError.type === "not_committed"
      ) {
        if (modifiedSource === "workingDirectory") {
          // Working directory: use MonacoModelRegistry for shared, editable model
          const modelState = registry.getModelState(modelKey);

          if (modelState !== undefined) {
            // Model exists - get content from it
            const model = registry.getModel(modelKey);
            modifiedContent = model?.getValue() ?? null;
          } else {
            // Model doesn't exist - try to create it
            try {
              const model = await registry.getOrCreateModel(filePath, cwd);

              // Check if effect was cleaned up during async operation
              if (isStale) {
                return;
              }

              modifiedContent = model.getValue();
            } catch {
              // File doesn't exist in working directory either
              if (diffError === null) {
                diffError = {
                  type: "file_not_found",
                  message: `File "${filePath}" not found`,
                };
              }
            }
          }
        } else {
          // Git source: fetch from git (read-only)
          const modifiedRef = contentSourceToGitRef(modifiedSource);
          try {
            modifiedContent = await git.getFileAtRef(filePath, modifiedRef);
          } catch (error) {
            // Only set error if we don't already have one from original
            if (diffError === null) {
              diffError = createDiffError(error, modifiedRef, filePath);
            }
          }
        }

        // Check if effect was cleaned up during async operation
        if (isStale) {
          return;
        }

        // 4. Check for binary content in modified
        if (
          modifiedContent !== null &&
          diffError === null &&
          isBinaryContent(modifiedContent)
        ) {
          diffError = {
            type: "binary_file",
            message: `File "${filePath}" appears to be a binary file`,
          };
          modifiedContent = null;
        }
      }

      // 5. Handle case where file is new (not in original source but exists in modified)
      // This applies to:
      // - not_tracked: file is completely new and never been committed
      // - not_committed: file exists but not in the original source
      if (
        (diffError?.type === "not_tracked" ||
          diffError?.type === "not_committed") &&
        modifiedContent !== null
      ) {
        // This is okay - it's a new file being added
        // Clear the error since we can still show a diff (empty original vs modified)
        originalContent = "";
        diffError = null;
      }

      // Only update state if still mounted AND this effect is still current
      // The isStale check prevents race conditions when rapidly switching files
      if (isMountedRef.current && !isStale) {
        setState({
          original: originalContent,
          modified: modifiedContent,
          isLoading: false,
          error: diffError,
          errorMessage: diffError?.message ?? null,
          isModifiedEditable,
        });
      }
    };

    // Call loadContent with error handling to prevent unhandled rejections
    loadContent().catch((error) => {
      // Handle any unexpected errors that weren't caught inside loadContent
      console.error("Unexpected error loading diff content:", error);
      if (isMountedRef.current && !isStale) {
        setState({
          original: null,
          modified: null,
          isLoading: false,
          error: {
            type: "unknown",
            message:
              error instanceof Error ? error.message : "Failed to load diff",
          },
          errorMessage:
            error instanceof Error ? error.message : "Failed to load diff",
          isModifiedEditable,
        });
      }
    });

    // Cleanup: mark this effect as stale when dependencies change
    // This prevents older fetches from overwriting newer results
    return () => {
      isStale = true;
    };
  }, [
    filePath,
    cwd,
    originalSource,
    modifiedSource,
    isModifiedEditable,
    git,
    originalFilePath,
  ]);

  return state;
}
