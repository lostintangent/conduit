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
import { useGitSubscription } from "@features/git/components/useGitSubscription";
import { useQuery } from "@tanstack/react-query";
import {
  type ContentSource,
  contentSourceToGitRef,
  isGitSource,
} from "../types";
import {
  binaryFileError,
  type ContentError,
  gitReadError,
  isBinaryContent,
} from "../utils";

/**
 * Result returned by useGitContent hook.
 */
export interface GitContentResult {
  /** Content from git, or null if loading/error/not found */
  content: string | null;

  /** Whether content is currently being loaded */
  isLoading: boolean;

  /** Structured error information if loading failed */
  error: ContentError | null;
}

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
  const git = useGitSubscription(cwd);
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
      error: gitReadError(query.error, ref, filePath),
    };
  }
  if (!query.isSuccess) {
    return { content: null, isLoading: true, error: null };
  }
  if (query.data !== null && isBinaryContent(query.data)) {
    return {
      content: null,
      isLoading: false,
      error: binaryFileError(filePath),
    };
  }
  return { content: query.data, isLoading: false, error: null };
}
