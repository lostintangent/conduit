/**
 * useCommitGraph Hook
 *
 * State for the commit graph: history pages and tracked branches from the
 * query cache (kept current by the git query bridge), swimlane layout, and
 * which commits are expanded, with their files loaded on first expand.
 */

import { useCallback, useMemo, useState } from "react";
import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { gitQueries } from "@/api/gitQueries";
import type { GitV2API, TrackedBranchInfo } from "@/api/GitV2API";
import type { CommitGraphNode } from "../components/CommitGraph/types";
import { computeSwimlanes } from "../components/CommitGraph/graph/swimlanes";

export interface UseCommitGraphOptions {
  /** The current HEAD commit ID. Defaults to the newest commit loaded. */
  headCommitId?: string;
}

export interface CommitGraphState {
  /** Computed graph nodes with swimlane positions */
  nodes: CommitGraphNode[];

  /** Whether more commits are available */
  hasMore: boolean;

  /** True while the history is being read, but not while loading more */
  isLoading: boolean;

  /** True while loading more commits */
  isLoadingMore: boolean;

  /** Error message, or null if no error */
  error: string | null;

  /** Set of expanded commit IDs */
  expandedCommitIds: Set<string>;

  /** Current branch, upstream and base, for VS Code-style coloring */
  trackedBranches: TrackedBranchInfo | null;
}

export interface CommitGraphActions {
  /** Re-read the history and tracked branches. */
  refresh: () => void;

  /** Load the next page of commits. */
  loadMore: () => void;

  /** Expand or collapse a commit, loading its files the first time. */
  toggleExpand: (commitId: string) => void;
}

export interface UseCommitGraphResult
  extends CommitGraphState, CommitGraphActions {}

/**
 * Extract user-friendly error message from various error types.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;

    // Handle common git errors
    if (message.includes("not a git repository")) {
      return "Not a git repository";
    }
    if (message.includes("bad revision")) {
      return "Invalid branch or commit reference";
    }

    return message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "An unknown error occurred";
}

export function useCommitGraph(
  git: GitV2API,
  { headCommitId: providedHeadCommitId }: UseCommitGraphOptions = {},
): UseCommitGraphResult {
  const history = useInfiniteQuery(gitQueries.commitHistory(git));
  const trackedBranchesQuery = useQuery(gitQueries.trackedBranches(git));
  const trackedBranches = trackedBranchesQuery.data ?? null;

  const [expandedCommitIds, setExpandedCommitIds] = useState<Set<string>>(
    () => new Set(),
  );
  const expandedIds = [...expandedCommitIds];
  const expandedFiles = useQueries({
    queries: expandedIds.map((id) => gitQueries.commitFiles(git, id)),
  });

  const commits = useMemo(
    () => history.data?.pages.flatMap((page) => page.commits) ?? [],
    [history.data],
  );

  // Commits are in topological order from HEAD, so the first one is HEAD
  const headCommitId = providedHeadCommitId ?? commits[0]?.id;

  const graphNodes = useMemo<CommitGraphNode[]>(() => {
    if (commits.length === 0) {
      return [];
    }

    return computeSwimlanes(commits, {
      headCommitId,
      trackedBranches: trackedBranches ?? undefined,
    });
  }, [commits, headCommitId, trackedBranches]);

  const nodes = graphNodes.map((node) => {
    const files = expandedFiles[expandedIds.indexOf(node.commit.id)];
    return {
      ...node,
      files: files?.data,
      isLoadingFiles: files?.isLoading ?? false,
    };
  });

  const { refetch: refetchHistory } = history;
  const { refetch: refetchTrackedBranches } = trackedBranchesQuery;
  const refresh = useCallback(() => {
    void refetchHistory();
    void refetchTrackedBranches();
  }, [refetchHistory, refetchTrackedBranches]);

  const { hasNextPage, isFetching, fetchNextPage } = history;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetching) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetching, fetchNextPage]);

  const toggleExpand = useCallback((commitId: string) => {
    setExpandedCommitIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(commitId)) {
        next.add(commitId);
      }
      return next;
    });
  }, []);

  const isLoading = history.isFetching && !history.isFetchingNextPage;

  return {
    nodes,
    hasMore: hasNextPage,
    isLoading,
    isLoadingMore: history.isFetchingNextPage,
    error: history.error && !isLoading ? getErrorMessage(history.error) : null,
    expandedCommitIds,
    trackedBranches,
    refresh,
    loadMore,
    toggleExpand,
  };
}
