/**
 * useCommitDetails Hook
 *
 * Fetches commit metadata and file list for displaying in CommitReviewPane.
 * Handles loading and error states for the async data fetch.
 *
 * @example
 * ```tsx
 * function CommitView({ commitId }: Props) {
 *   const { commit, files, isLoading, error } = useCommitDetails(commitId, git);
 *
 *   if (isLoading) return <Loading />;
 *   if (error) return <Error message={error} />;
 *
 *   return (
 *     <div>
 *       <h1>{commit.subject}</h1>
 *       {files.map(file => <FileItem key={file.path} file={file} />)}
 *     </div>
 *   );
 * }
 * ```
 */

import { useEffect, useState, useRef } from "react";
import type { GitV2API } from "@/api/GitV2API";
import type { HistoryCommit, CommitFile } from "@/api/GitV2API";

// ============================================================================
// Types
// ============================================================================

/**
 * Result returned by useCommitDetails hook.
 */
export interface CommitDetailsResult {
  /** The commit metadata (null while loading or on error) */
  commit: HistoryCommit | null;

  /** Files changed in this commit (empty while loading or on error) */
  files: CommitFile[];

  /** Whether data is currently being loaded */
  isLoading: boolean;

  /** Error message if loading failed */
  error: string | null;

  /** Computed statistics from files */
  stats: {
    /** Total files changed */
    filesChanged: number;
    /** Total lines added */
    additions: number;
    /** Total lines deleted */
    deletions: number;
  };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to fetch commit details and files.
 *
 * Fetches both commit metadata and file list when commitId is provided.
 * Returns loading and error states for UI feedback.
 *
 * @param commitId - The commit to fetch details for (null to skip)
 * @param git - GitV2API instance for fetching data
 * @returns CommitDetailsResult with commit, files, loading state, and error
 */
export function useCommitDetails(
  commitId: string | null,
  git: GitV2API,
): CommitDetailsResult {
  const [commit, setCommit] = useState<HistoryCommit | null>(null);
  const [files, setFiles] = useState<CommitFile[]>([]);
  const [isLoading, setIsLoading] = useState(commitId !== null);
  const [error, setError] = useState<string | null>(null);

  // Track mounted state
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Reset state when commitId is null
    if (commitId === null) {
      setCommit(null);
      setFiles([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Track if this effect is still current
    let isStale = false;

    // Start loading
    setIsLoading(true);
    setError(null);

    const fetchDetails = async () => {
      try {
        // Fetch commit metadata and files in parallel
        const [commitData, filesData] = await Promise.all([
          git.getCommit(commitId),
          git.getCommitFiles(commitId),
        ]);

        if (isStale || !isMountedRef.current) return;

        if (!commitData) {
          setError(`Commit ${commitId.slice(0, 7)} not found`);
          setIsLoading(false);
          return;
        }

        setCommit(commitData);
        setFiles(filesData);
        setIsLoading(false);
      } catch (err) {
        if (isStale || !isMountedRef.current) return;

        const message =
          err instanceof Error ? err.message : "Failed to load commit details";
        setError(message);
        setIsLoading(false);
      }
    };

    fetchDetails();

    return () => {
      isStale = true;
    };
  }, [commitId, git]);

  // Compute stats from files
  const stats = {
    filesChanged: files.length,
    additions: files.reduce((sum, file) => sum + (file.additions ?? 0), 0),
    deletions: files.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
  };

  return {
    commit,
    files,
    isLoading,
    error,
    stats,
  };
}
