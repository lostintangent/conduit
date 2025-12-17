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

import { useEffect, useRef, useState } from "react";
import { useGitV2 } from "../../../../hooks/useGitV2";
import { MonacoModelRegistry, createModelKey } from "../registry";
import { EditorTracing } from "../utils/editorTracing";

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
 * Check if content has a UTF-16 BOM (Byte Order Mark).
 *
 * UTF-16 files legitimately contain null bytes and should not be
 * flagged as binary. This checks for:
 * - UTF-16 LE: 0xFF 0xFE (displays as \uFFFE in JS string)
 * - UTF-16 BE: 0xFE 0xFF (displays as \uFEFF in JS string)
 * - UTF-8 BOM: 0xEF 0xBB 0xBF (displays as \uFEFF after UTF-8 decode)
 */
function hasUnicodeBOM(content: string): boolean {
  if (content.length === 0) return false;

  const firstChar = content.charCodeAt(0);

  // UTF-8 BOM or UTF-16 BE BOM (both result in 0xFEFF)
  if (firstChar === 0xfeff) return true;

  // UTF-16 LE BOM (0xFF 0xFE, which may appear as 0xFFFE in some contexts)
  if (firstChar === 0xfffe) return true;

  return false;
}

/**
 * Check if content appears to be binary.
 *
 * Uses a heuristic that:
 * 1. First checks for Unicode BOMs - files with BOMs are text
 * 2. Then looks for control characters that indicate binary content
 *
 * We look for:
 * - Null bytes (0x00) - common in binary files
 * - Control chars 0x01-0x08 - not used in text files
 * - Control char 0x0E-0x1F (except 0x1B ESC for ANSI codes)
 *
 * We explicitly allow:
 * - Tab (0x09), LF (0x0A), CR (0x0D) - normal text
 * - ESC (0x1B) - ANSI escape codes
 * - DEL (0x7F) - sometimes in text
 */
function isBinaryContent(content: string): boolean {
  // Files with Unicode BOMs are text files
  if (hasUnicodeBOM(content)) {
    return false;
  }

  const checkLength = Math.min(content.length, 8192);

  for (let i = 0; i < checkLength; i++) {
    const charCode = content.charCodeAt(i);

    // Null byte - strong indicator of binary
    if (charCode === 0) {
      return true;
    }

    // Control characters 0x01-0x08 (SOH, STX, ETX, EOT, ENQ, ACK, BEL, BS)
    // These are rarely used in text files
    if (charCode >= 0x01 && charCode <= 0x08) {
      return true;
    }

    // Control characters 0x0B (VT) and 0x0C (FF)
    // We allow 0x09 (TAB), 0x0A (LF), and 0x0D (CR) as they're common in text
    // But VT and FF are rarely used in modern text files
    if (charCode === 0x0b || charCode === 0x0c) {
      return true;
    }

    // Control characters 0x0E-0x1A (SO, SI, DLE, DC1-4, NAK, SYN, ETB, CAN, EM, SUB)
    // Skip 0x1B (ESC) as it's used for ANSI escape codes
    if (charCode >= 0x0e && charCode <= 0x1a) {
      return true;
    }

    // Control characters 0x1C-0x1F (FS, GS, RS, US)
    if (charCode >= 0x1c && charCode <= 0x1f) {
      return true;
    }
  }

  return false;
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
  baseBranch: string | undefined,
  cwd: string,
  sandboxId?: string,
): DiffContent {
  const [state, setState] = useState<DiffContent>({
    original: null,
    modified: null,
    isLoading: filePath !== null,
    error: null,
    errorMessage: null,
  });

  // Git API for fetching original content
  const git = useGitV2(cwd, sandboxId);

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
      const diffContentTraceId = EditorTracing.startTrace(
        filePath,
        "useDiffContent",
        { baseBranch, cwd, sandboxId },
      );

      const registry = MonacoModelRegistry.getInstance();
      const modelKey = createModelKey(filePath, sandboxId);
      const ref = baseBranch || "HEAD";

      let originalContent: string | null = null;
      let modifiedContent: string | null = null;
      let diffError: DiffError | null = null;

      // 1. Fetch original content from git
      const gitTraceId = EditorTracing.startTrace(
        filePath,
        "git.getFileAtRef",
        { ref },
      );
      try {
        originalContent = await git.getFileAtRef(filePath, ref);
        EditorTracing.endTrace(filePath, gitTraceId, {
          contentLength: originalContent?.length,
        });
      } catch (error) {
        EditorTracing.endTrace(filePath, gitTraceId, {
          error: String(error),
        });
        // Create specific error for git fetch failure
        diffError = createDiffError(error, ref, filePath);
      }

      // Check if effect was cleaned up during async operation
      if (isStale) {
        EditorTracing.endTrace(filePath, diffContentTraceId, {
          result: "stale",
        });
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

      // 3. Get modified content from model registry (if no error yet)
      // Also load modified content for not_tracked and not_committed files
      // so we can show them as "added" in the diff
      if (
        diffError === null ||
        diffError.type === "not_tracked" ||
        diffError.type === "not_committed"
      ) {
        const modelState = registry.getModelState(modelKey);

        if (modelState !== undefined) {
          // Model exists - get content from it
          const model = registry.getModel(modelKey);
          modifiedContent = model?.getValue() ?? null;
          EditorTracing.logTiming("diff.modifiedFromCache", 0, {
            cached: true,
          });
        } else {
          // Model doesn't exist - try to create it
          const modifiedTraceId = EditorTracing.startTrace(
            filePath,
            "diff.loadModified",
          );
          try {
            const model = await registry.getOrCreateModel(
              filePath,
              cwd,
              sandboxId,
            );

            // Check if effect was cleaned up during async operation
            if (isStale) {
              EditorTracing.endTrace(filePath, modifiedTraceId, {
                result: "stale",
              });
              EditorTracing.endTrace(filePath, diffContentTraceId, {
                result: "stale",
              });
              return;
            }

            modifiedContent = model.getValue();
            EditorTracing.endTrace(filePath, modifiedTraceId, {
              contentLength: modifiedContent?.length,
            });
          } catch {
            EditorTracing.endTrace(filePath, modifiedTraceId, {
              result: "error",
            });
            // File doesn't exist in working directory either
            if (diffError === null) {
              diffError = {
                type: "file_not_found",
                message: `File "${filePath}" not found`,
              };
            }
          }
        }

        // Check if effect was cleaned up during async operation
        if (isStale) {
          EditorTracing.endTrace(filePath, diffContentTraceId, {
            result: "stale",
          });
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

      // 5. Handle case where file is new (not in git/branch but exists in working dir)
      // This applies to:
      // - not_tracked: file is completely new and never been committed
      // - not_committed: file exists on disk but not in the base branch (e.g., new file in feature branch)
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

      // Note: Deleted files are handled by DeletedFileViewer, not the diff editor.
      // The DeletedFileViewer shows a read-only editor with the git content.

      EditorTracing.endTrace(filePath, diffContentTraceId, {
        result: diffError ? "error" : "success",
        errorType: diffError?.type,
      });

      // Only update state if still mounted AND this effect is still current
      // The isStale check prevents race conditions when rapidly switching files
      if (isMountedRef.current && !isStale) {
        setState({
          original: originalContent,
          modified: modifiedContent,
          isLoading: false,
          error: diffError,
          errorMessage: diffError?.message ?? null,
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
        });
      }
    });

    // Cleanup: mark this effect as stale when dependencies change
    // This prevents older fetches from overwriting newer results
    return () => {
      isStale = true;
    };
  }, [filePath, baseBranch, cwd, git]);

  return state;
}
