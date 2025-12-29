/**
 * useGitContent Hook
 *
 * Fetches file content from a git source (HEAD, index, or any ref).
 * Used by editors that need to display content from git rather than
 * the working directory.
 *
 * @example
 * ```tsx
 * function GitFileViewer({ filePath, source, cwd }: Props) {
 *   const { content, isLoading, error } = useGitContent(filePath, source, cwd);
 *
 *   if (isLoading) return <Loading />;
 *   if (error) return <Error message={error.message} />;
 *
 *   return <Editor value={content} readOnly />;
 * }
 * ```
 */

import { useEffect, useRef, useState } from "react";
import { useGitV2 } from "../../../../hooks/useGitV2";
import { type ContentSource, contentSourceToGitRef } from "../types";

// ============================================================================
// Error Types
// ============================================================================

/**
 * Specific error types for git content loading.
 */
export type GitContentErrorType =
  | "not_tracked" // File is not tracked by git
  | "not_in_ref" // File doesn't exist at the specified ref
  | "ref_not_found" // Git ref (branch/commit) doesn't exist
  | "binary_file" // File appears to be binary
  | "unknown"; // Other/unexpected error

/**
 * Structured error information for git content loading failures.
 */
export interface GitContentError {
  /** The type of error for programmatic handling */
  type: GitContentErrorType;

  /** Human-readable error message */
  message: string;
}

/**
 * Result returned by useGitContent hook.
 */
export interface GitContentResult {
  /** Content from git, or null if loading/error/not found */
  content: string | null;

  /** Whether content is currently being loaded */
  isLoading: boolean;

  /** Structured error information if loading failed */
  error: GitContentError | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if content has a UTF-16 BOM (Byte Order Mark).
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
 * Uses a heuristic that checks for control characters that indicate
 * binary content, while allowing Unicode BOMs and common text characters.
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
    if (charCode >= 0x01 && charCode <= 0x08) {
      return true;
    }

    // Control characters 0x0B (VT) and 0x0C (FF)
    if (charCode === 0x0b || charCode === 0x0c) {
      return true;
    }

    // Control characters 0x0E-0x1A (SO, SI, DLE, DC1-4, NAK, SYN, ETB, CAN, EM, SUB)
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
 * Create a GitContentError from an error object and context.
 */
function createGitContentError(
  error: unknown,
  ref: string,
  _filePath: string,
): GitContentError {
  const originalMessage =
    error instanceof Error ? error.message : String(error);
  const errorMsg = originalMessage.toLowerCase();

  // Binary file
  if (errorMsg.includes("binary")) {
    return {
      type: "binary_file",
      message: `File appears to be binary`,
    };
  }

  // Git ref/revision not found
  if (
    (errorMsg.includes("bad revision") ||
      errorMsg.includes("unknown revision") ||
      errorMsg.includes("ambiguous argument")) &&
    !errorMsg.includes("exists in index")
  ) {
    return {
      type: "ref_not_found",
      message: `Git ref "${ref || "index"}" not found`,
    };
  }

  // File exists but has no committed version
  if (errorMsg.includes("exists on disk") && errorMsg.includes("fatal")) {
    return {
      type: "not_tracked",
      message: `File is not tracked in git`,
    };
  }

  // File not in git
  if (
    errorMsg.includes("does not exist") ||
    errorMsg.includes("did not match") ||
    (errorMsg.includes("pathspec") && errorMsg.includes("error"))
  ) {
    return {
      type: "not_in_ref",
      message: `File does not exist at ${ref || "index"}`,
    };
  }

  // Unknown error - preserve the original message
  return {
    type: "unknown",
    message: originalMessage || "Failed to load content from git",
  };
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Fetches file content from a git source.
 *
 * @param filePath - Absolute path to the file, or null for no content
 * @param source - Git source to fetch from (must not be 'workingDirectory')
 * @param cwd - Working directory for git operations
 * @param sandboxId - Optional sandbox ID for VM file operations
 * @returns GitContentResult with content, loading state, and error
 */
export function useGitContent(
  filePath: string | null,
  source: ContentSource,
  cwd: string,
  sandboxId?: string,
): GitContentResult {
  const [state, setState] = useState<GitContentResult>({
    content: null,
    isLoading: filePath !== null,
    error: null,
  });

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
        content: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    // workingDirectory should not use this hook
    if (source === "workingDirectory") {
      setState({
        content: null,
        isLoading: false,
        error: {
          type: "unknown",
          message:
            "useGitContent cannot be used with 'workingDirectory' source",
        },
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
      const ref = contentSourceToGitRef(source);

      try {
        const content = await git.getFileAtRef(filePath, ref);

        if (isStale || !isMountedRef.current) {
          return;
        }

        // Check for binary content
        if (content !== null && isBinaryContent(content)) {
          setState({
            content: null,
            isLoading: false,
            error: {
              type: "binary_file",
              message: "File appears to be binary",
            },
          });
          return;
        }

        setState({
          content,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        if (isStale || !isMountedRef.current) {
          return;
        }

        setState({
          content: null,
          isLoading: false,
          error: createGitContentError(error, ref, filePath),
        });
      }
    };

    loadContent();

    return () => {
      isStale = true;
    };
  }, [filePath, source, cwd, git]);

  return state;
}
