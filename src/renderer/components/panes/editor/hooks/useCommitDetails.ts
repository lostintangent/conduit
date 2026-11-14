/**
 * useCommitDetails Hook
 *
 * Reads a commit's metadata and changed files for the commit review view.
 * The files come from the same cache entry the commit graph fills when the
 * commit is expanded there.
 */

import { useQuery } from "@tanstack/react-query";
import { gitQueries } from "@/api/gitQueries";
import type { CommitFile, GitV2API, HistoryCommit } from "@/api/GitV2API";

export interface CommitDetailsResult {
  /** The commit metadata (null while loading or on error) */
  commit: HistoryCommit | null;

  /** Files changed in this commit (empty while loading or on error) */
  files: CommitFile[];

  /** Whether data is currently being loaded */
  isLoading: boolean;

  /** Error message if loading failed */
  error: string | null;
}

const NO_FILES: CommitFile[] = [];

/**
 * @param commitId - The commit to read, or null to read nothing
 * @param git - GitV2API instance for the commit's repository
 */
export function useCommitDetails(
  commitId: string | null,
  git: GitV2API,
): CommitDetailsResult {
  const enabled = commitId !== null;
  const commit = useQuery({
    ...gitQueries.commit(git, commitId ?? ""),
    enabled,
  });
  const files = useQuery({
    ...gitQueries.commitFiles(git, commitId ?? ""),
    enabled,
  });

  const failure = commit.error ?? files.error;
  let error: string | null = null;
  if (failure) {
    error = failure.message || "Failed to load commit details";
  } else if (enabled && commit.data === null) {
    error = `Commit ${commitId.slice(0, 7)} not found`;
  }

  return {
    commit: commit.data ?? null,
    files: files.data ?? NO_FILES,
    isLoading: commit.isLoading || files.isLoading,
    error,
  };
}
