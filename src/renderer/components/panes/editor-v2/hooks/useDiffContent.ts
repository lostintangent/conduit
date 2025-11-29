/**
 * useDiffContent Hook
 *
 * Provides the original and modified content for a diff view. The original
 * content comes from git (HEAD or a specified branch), while the modified
 * content comes from the current working directory via the Monaco model.
 *
 * @example
 * ```tsx
 * function DiffEditor({ filePath, baseBranch, cwd }: Props) {
 *   const diff = useDiffContent(filePath, baseBranch, cwd);
 *
 *   if (diff.isLoading) return <Loading />;
 *   if (diff.error) return <Error message={diff.error} />;
 *
 *   return (
 *     <MonacoDiffEditor
 *       original={diff.original}
 *       modified={diff.modified}
 *     />
 *   );
 * }
 * ```
 */

import { useEffect, useState, useRef } from "react";
import { useGitV2 } from "../../../../hooks/useGitV2";
import { MonacoModelRegistry, pathToUri } from "../registry";

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
  /** Original content from git (HEAD or baseBranch) */
  original: string | null;

  /** Modified content from working directory */
  modified: string | null;

  /** Whether content is currently being loaded */
  isLoading: boolean;

  /** Structured error information if loading failed */
  error: DiffError | null;

  /** Legacy: Simple error message (for backwards compatibility) */
  errorMessage: string | null;
}

/**
 * Hook to get diff content for a file.
 *
 * Fetches the original content from git and the modified content from
 * the MonacoModelRegistry. Handles loading states and errors gracefully.
 *
 * @param filePath - Absolute path to the file, or null for no content
 * @param baseBranch - Git ref for original content (default: 'HEAD')
 * @param cwd - Working directory for git operations
 * @returns DiffContent with original, modified, loading state, and error
 */
/**
 * Check if content appears to be binary.
 *
 * Simple heuristic: look for null bytes in first 8KB.
 */
function isBinaryContent(content: string): boolean {
  const checkLength = Math.min(content.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    if (content.charCodeAt(i) === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Create a DiffError from an error object and context.
 */
function createDiffError(
  error: unknown,
  ref: string,
  filePath: string,
): DiffError {
  const errorMsg = error instanceof Error ? error.message.toLowerCase() : "";

  // Detect specific error types based on error message patterns
  if (
    errorMsg.includes("does not exist") ||
    errorMsg.includes("path") ||
    errorMsg.includes("not found")
  ) {
    // Check if it's a ref issue or file issue
    if (
      errorMsg.includes("revision") ||
      errorMsg.includes("ref") ||
      errorMsg.includes("branch")
    ) {
      return {
        type: "ref_not_found",
        message: `Git ref "${ref}" not found`,
      };
    }
    return {
      type: "not_tracked",
      message: `File "${filePath}" is not tracked in git at ${ref}`,
    };
  }

  if (errorMsg.includes("fatal") && errorMsg.includes("exists on disk")) {
    return {
      type: "not_committed",
      message: `File "${filePath}" has no committed version yet`,
    };
  }

  if (errorMsg.includes("binary")) {
    return {
      type: "binary_file",
      message: `File "${filePath}" appears to be a binary file`,
    };
  }

  // Unknown error
  return {
    type: "unknown",
    message:
      error instanceof Error ? error.message : "Failed to load diff content",
  };
}

export function useDiffContent(
  filePath: string | null,
  baseBranch: string | undefined,
  cwd: string,
): DiffContent {
  const [state, setState] = useState<DiffContent>({
    original: null,
    modified: null,
    isLoading: filePath !== null,
    error: null,
    errorMessage: null,
  });

  // Git API for fetching original content
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
      });
      return;
    }

    // Start loading
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      errorMessage: null,
    }));

    const loadContent = async () => {
      const registry = MonacoModelRegistry.getInstance();
      const uri = pathToUri(filePath);
      const ref = baseBranch || "HEAD";

      let originalContent: string | null = null;
      let modifiedContent: string | null = null;
      let diffError: DiffError | null = null;

      // 1. Fetch original content from git
      try {
        originalContent = await git.getFileAtRef(filePath, ref);
      } catch (error) {
        // Create specific error for git fetch failure
        diffError = createDiffError(error, ref, filePath);
      }

      // 2. Check for binary content in original
      if (originalContent !== null && isBinaryContent(originalContent)) {
        diffError = {
          type: "binary_file",
          message: `File "${filePath}" appears to be a binary file`,
        };
        originalContent = null;
      }

      // 3. Get modified content from model registry (if no error yet)
      if (diffError === null || diffError.type === "not_tracked") {
        const modelState = registry.getModelState(uri);

        if (modelState !== undefined) {
          // Model exists - get content from it
          const model = registry.getModel(uri);
          modifiedContent = model?.getValue() ?? null;
        } else {
          // Model doesn't exist - try to create it
          try {
            const model = await registry.getOrCreateModel(filePath, cwd);
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

      // 5. Handle case where file is new (not in git but exists in working dir)
      if (diffError?.type === "not_tracked" && modifiedContent !== null) {
        // This is okay - it's a new file being added
        // Clear the error since we can still show a diff (empty original vs modified)
        originalContent = "";
        diffError = null;
      }

      // Only update state if still mounted
      if (isMountedRef.current) {
        setState({
          original: originalContent,
          modified: modifiedContent,
          isLoading: false,
          error: diffError,
          errorMessage: diffError?.message ?? null,
        });
      }
    };

    loadContent();
  }, [filePath, baseBranch, cwd, git]);

  return state;
}
