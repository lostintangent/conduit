/**
 * useGitContent Hook
 *
 * Fetches file content from a git source (HEAD, index, or any ref).
 * Used by editors that need to display content from git rather than
 * the working directory.
 *
 * It reads through `gitQueries.fileAtRef`, as diffs do, so an editor and a
 * diff showing the same side share a read, and the git bridge re-reads it
 * when a stage or commit moves it.
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

import { gitQueries } from "@features/git/client/queries";
import { useGitV2 } from "@features/git/components/useGitV2";
import { useQuery } from "@tanstack/react-query";
import {
  type ContentSource,
  contentSourceToGitRef,
  isGitSource,
} from "../types";
import { isBinaryContent } from "../utils";

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
 * @returns GitContentResult with content, loading state, and error
 */
export function useGitContent(
  filePath: string | null,
  source: ContentSource,
  cwd: string,
): GitContentResult {
  const git = useGitV2(cwd);
  const ref = isGitSource(source) ? contentSourceToGitRef(source) : null;
  const query = useQuery({
    ...gitQueries.fileAtRef(git, filePath ?? "", ref ?? ""),
    enabled: filePath !== null && ref !== null,
  });

  if (filePath === null) {
    return { content: null, isLoading: false, error: null };
  }
  if (ref === null) {
    return {
      content: null,
      isLoading: false,
      error: {
        type: "unknown",
        message: "useGitContent cannot be used with 'workingDirectory' source",
      },
    };
  }
  if (query.isError) {
    return {
      content: null,
      isLoading: false,
      error: createGitContentError(query.error, ref, filePath),
    };
  }
  if (!query.isSuccess) {
    return { content: null, isLoading: true, error: null };
  }
  if (query.data !== null && isBinaryContent(query.data)) {
    return {
      content: null,
      isLoading: false,
      error: { type: "binary_file", message: "File appears to be binary" },
    };
  }
  return { content: query.data, isLoading: false, error: null };
}
