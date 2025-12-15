/**
 * useCommitGraph Hook
 *
 * Central state management hook for the commit graph feature.
 * Manages commit data, swimlane computation, expansion state, and pagination.
 *
 * Features:
 * - Fetches commit history from Git API
 * - Computes swimlane positions using graph algorithm
 * - Manages loading and error states
 * - Supports pagination (load more commits)
 * - Tracks expanded commits with lazy file loading
 * - Provides refresh functionality
 *
 * @example
 * ```tsx
 * function CommitGraphPanel({ git, headCommitId }) {
 *   const {
 *     nodes,
 *     isLoading,
 *     error,
 *     refresh,
 *     loadMore,
 *     toggleExpand,
 *   } = useCommitGraph(git, { headCommitId });
 *
 *   if (isLoading) return <LoadingState />;
 *   if (error) return <ErrorState message={error} onRetry={refresh} />;
 *
 *   return nodes.map(node => (
 *     <CommitRow key={node.commit.id} node={node} />
 *   ));
 * }
 * ```
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { GitV2API } from "@/api/GitV2API";
import type { CommitGraphNode, CommitFile } from "../types";
import { computeSwimlanes } from "../graph/swimlanes";
import type { HistoryCommit as IpcHistoryCommit } from "@/../../src/ipc/gitv2/types";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the useCommitGraph hook.
 */
export interface UseCommitGraphOptions {
  /**
   * The current HEAD commit ID.
   * Used to mark HEAD commits in the graph.
   */
  headCommitId?: string;

  /**
   * Number of commits to load per page.
   * @default 50
   */
  pageSize?: number;

  /**
   * Whether to load commits on mount.
   * @default true
   */
  loadOnMount?: boolean;
}

/**
 * State for the commit graph.
 */
export interface CommitGraphState {
  /** Computed graph nodes with swimlane positions */
  nodes: CommitGraphNode[];

  /** Whether more commits are available */
  hasMore: boolean;

  /** True during initial load */
  isLoading: boolean;

  /** True while loading more commits */
  isLoadingMore: boolean;

  /** Error message, or null if no error */
  error: string | null;

  /** Set of expanded commit IDs */
  expandedCommitIds: Set<string>;

  /** Set of commit IDs currently loading files */
  loadingFilesIds: Set<string>;
}

/**
 * Actions available from the hook.
 */
export interface CommitGraphActions {
  /**
   * Refresh the commit list from scratch.
   */
  refresh: () => Promise<void>;

  /**
   * Load more commits (pagination).
   */
  loadMore: () => Promise<void>;

  /**
   * Toggle expansion of a commit.
   * When expanding, lazy-loads files if not already loaded.
   */
  toggleExpand: (commitId: string) => Promise<void>;

  /**
   * Collapse all expanded commits.
   */
  collapseAll: () => void;

  /**
   * Clear the current error.
   */
  clearError: () => void;
}

/**
 * Return type for the useCommitGraph hook.
 */
export interface UseCommitGraphResult
  extends CommitGraphState,
    CommitGraphActions {}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_PAGE_SIZE = 50;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert IPC HistoryCommit to local HistoryCommit type.
 * The types are structurally identical, this is mainly for type safety.
 */
function toLocalCommit(commit: IpcHistoryCommit): CommitGraphNode["commit"] {
  return {
    id: commit.id,
    shortId: commit.shortId,
    subject: commit.subject,
    message: commit.message,
    author: commit.author,
    authorEmail: commit.authorEmail,
    timestamp: commit.timestamp,
    parentIds: commit.parentIds,
    refs: commit.refs,
  };
}

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

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for managing commit graph state.
 *
 * @param git - GitV2API instance for fetching data
 * @param options - Configuration options
 * @returns State and actions for the commit graph
 */
export function useCommitGraph(
  git: GitV2API,
  options: UseCommitGraphOptions = {},
): UseCommitGraphResult {
  const {
    headCommitId: providedHeadCommitId,
    pageSize = DEFAULT_PAGE_SIZE,
    loadOnMount = true,
  } = options;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  // Raw commits from Git API
  const [commits, setCommits] = useState<CommitGraphNode["commit"][]>([]);

  // Pagination state
  const [hasMore, setHasMore] = useState(false);
  const [currentSkip, setCurrentSkip] = useState(0);

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Expansion state
  const [expandedCommitIds, setExpandedCommitIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [loadingFilesIds, setLoadingFilesIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Files cache: commitId -> files
  const filesCache = useRef<Map<string, CommitFile[]>>(new Map());

  // Track if initial load has happened
  const hasLoadedRef = useRef(false);

  // HEAD commit ID: use provided value, or assume first commit is HEAD
  // (commits are loaded in topological order starting from HEAD)
  const headCommitId = providedHeadCommitId ?? commits[0]?.id;

  // ---------------------------------------------------------------------------
  // Computed State: Swimlane Nodes
  // ---------------------------------------------------------------------------

  const nodes = useMemo<CommitGraphNode[]>(() => {
    if (commits.length === 0) {
      return [];
    }

    // Compute swimlane positions
    const graphNodes = computeSwimlanes(commits, { headCommitId });

    // Attach files from cache
    return graphNodes.map((node) => {
      const files = filesCache.current.get(node.commit.id);
      const isLoadingFiles = loadingFilesIds.has(node.commit.id);

      return {
        ...node,
        files,
        isLoadingFiles,
      };
    });
  }, [commits, headCommitId, loadingFilesIds]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Load commits from the Git API.
   */
  const loadCommits = useCallback(
    async (skip: number, append: boolean) => {
      try {
        const result = await git.getCommitHistory({
          limit: pageSize,
          skip,
        });

        const newCommits = result.commits.map(toLocalCommit);

        if (append) {
          setCommits((prev) => [...prev, ...newCommits]);
        } else {
          setCommits(newCommits);
        }

        setHasMore(result.hasMore);
        setCurrentSkip(skip + newCommits.length);
        setError(null);
      } catch (err) {
        setError(getErrorMessage(err));
        throw err;
      }
    },
    [git, pageSize],
  );

  /**
   * Refresh the commit list from scratch.
   */
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await loadCommits(0, false);
    } finally {
      setIsLoading(false);
    }
  }, [loadCommits]);

  /**
   * Load more commits (pagination).
   */
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) {
      return;
    }

    setIsLoadingMore(true);

    try {
      await loadCommits(currentSkip, true);
    } finally {
      setIsLoadingMore(false);
    }
  }, [loadCommits, currentSkip, hasMore, isLoadingMore]);

  /**
   * Load files for a commit.
   */
  const loadFilesForCommit = useCallback(
    async (commitId: string) => {
      // Check cache first
      if (filesCache.current.has(commitId)) {
        return;
      }

      // Mark as loading
      setLoadingFilesIds((prev) => new Set(prev).add(commitId));

      try {
        const files = await git.getCommitFiles(commitId);

        // Convert to local type and cache
        const localFiles: CommitFile[] = files.map((f) => ({
          path: f.path,
          status: f.status as CommitFile["status"],
          originalPath: f.originalPath,
          additions: f.additions,
          deletions: f.deletions,
        }));

        filesCache.current.set(commitId, localFiles);
      } catch (err) {
        // Log error but don't fail the whole operation
        console.error(`Failed to load files for commit ${commitId}:`, err);
      } finally {
        // Remove from loading set
        setLoadingFilesIds((prev) => {
          const next = new Set(prev);
          next.delete(commitId);
          return next;
        });
      }
    },
    [git],
  );

  /**
   * Toggle expansion of a commit.
   */
  const toggleExpand = useCallback(
    async (commitId: string) => {
      const isCurrentlyExpanded = expandedCommitIds.has(commitId);

      if (isCurrentlyExpanded) {
        // Collapse
        setExpandedCommitIds((prev) => {
          const next = new Set(prev);
          next.delete(commitId);
          return next;
        });
      } else {
        // Expand and load files if needed
        setExpandedCommitIds((prev) => new Set(prev).add(commitId));

        // Lazy load files
        await loadFilesForCommit(commitId);
      }
    },
    [expandedCommitIds, loadFilesForCommit],
  );

  /**
   * Collapse all expanded commits.
   */
  const collapseAll = useCallback(() => {
    setExpandedCommitIds(new Set());
  }, []);

  /**
   * Clear the error state.
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  /**
   * Load commits on mount (if enabled).
   */
  useEffect(() => {
    if (loadOnMount && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      refresh();
    }
  }, [loadOnMount, refresh]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // State
    nodes,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    expandedCommitIds,
    loadingFilesIds,

    // Actions
    refresh,
    loadMore,
    toggleExpand,
    collapseAll,
    clearError,
  };
}
