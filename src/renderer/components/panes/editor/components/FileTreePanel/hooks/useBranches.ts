/**
 * useBranches - Hook for fetching and managing branch data.
 *
 * Provides a unified way to fetch branches from GitV2API with:
 * - Automatic filtering (local branches only by default)
 * - Sorting by last commit date (most recent first)
 * - Loading and error states
 * - Manual refresh capability
 *
 * Used by both BranchSwitcher (checkout) and BranchSelector (comparison).
 *
 * @example
 * ```tsx
 * const { branches, isLoading, error, refresh } = useBranches(git, {
 *   enabled: isDropdownOpen,
 *   includeRemote: false,
 * });
 * ```
 */

import { useMemo } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { gitKeys, gitQueries } from "@/api/gitQueries";
import type { GitV2API } from "@/api/GitV2API";
import type { GitBranch } from "@/api/GitV2API";

export interface UseBranchesOptions {
  /** Whether to fetch branches (useful for lazy loading when dropdown opens) */
  enabled?: boolean;

  /** Include remote branches (default: false) */
  includeRemote?: boolean;

  /** Pin the current branch at the top of the list */
  currentBranchFirst?: boolean;

  /** Current branch name (used for sorting when currentBranchFirst is true) */
  currentBranch?: string | null;
}

export interface UseBranchesResult {
  /** List of branches (filtered and sorted) */
  branches: GitBranch[];

  /** Raw branches before filtering */
  allBranches: GitBranch[];

  /** Whether branches are being loaded for the first time */
  isLoading: boolean;

  /** Error message if loading failed */
  error: string | null;

  /** Manually refresh the branch list */
  refresh: () => Promise<void>;
}

const NO_BRANCHES: GitBranch[] = [];

/**
 * Hook for fetching and managing branch data from GitV2API.
 */
export function useBranches(
  git: GitV2API | null,
  options: UseBranchesOptions = {},
): UseBranchesResult {
  const {
    enabled = true,
    includeRemote = false,
    currentBranchFirst = true,
    currentBranch = null,
  } = options;

  // Re-read whenever it's enabled (a picker opening), showing the last list
  // meanwhile
  const query = useQuery(
    git
      ? { ...gitQueries.branches(git), enabled }
      : { queryKey: gitKeys.branches(""), queryFn: skipToken },
  );
  const allBranches = query.data ?? NO_BRANCHES;

  // Filter and sort branches
  const branches = useMemo(() => {
    let filtered = allBranches;

    // Filter out remote branches if not included
    if (!includeRemote) {
      filtered = filtered.filter((b) => !b.isRemote);
    }

    // Sort by last commit date (most recent first)
    // Optionally pin current branch at top
    return [...filtered].sort((a, b) => {
      if (currentBranchFirst) {
        if (a.name === currentBranch) return -1;
        if (b.name === currentBranch) return 1;
      }

      const dateA = a.lastCommitDate ? new Date(a.lastCommitDate).getTime() : 0;
      const dateB = b.lastCommitDate ? new Date(b.lastCommitDate).getTime() : 0;
      return dateB - dateA;
    });
  }, [allBranches, includeRemote, currentBranchFirst, currentBranch]);

  return {
    branches,
    allBranches,
    isLoading: query.isLoading,
    error: query.isError ? "Failed to load branches" : null,
    refresh: async () => {
      await query.refetch();
    },
  };
}

/**
 * Filter branches by search query.
 * Utility function for components that need search filtering.
 */
export function filterBranchesByQuery(
  branches: GitBranch[],
  query: string,
  options: { excludeHead?: boolean; limit?: number } = {},
): GitBranch[] {
  const { excludeHead = true, limit = 15 } = options;
  const lowerQuery = query.toLowerCase();

  return branches
    .filter((b) => {
      if (excludeHead && b.name.toLowerCase() === "head") return false;
      return b.name.toLowerCase().includes(lowerQuery);
    })
    .slice(0, limit);
}
