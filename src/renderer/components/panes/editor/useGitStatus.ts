import type { Branch, GitStatusMap } from "@shared/types";
import { useCallback, useEffect, useState } from "react";

const api = window.conduit;

// Module-level cache for git status data (persists across component mounts)
// This prevents loading states when switching between tabs
type GitStatusCache = {
  gitStatus: GitStatusMap | null;
  currentBranch: string | null;
  baseBranch: string | null;
  branches: Branch[];
  isInGitRepo: boolean;
};

const gitStatusCache = new Map<string, GitStatusCache>();

export function useGitStatus(cwd: string) {
  // Initialize from cache if available
  const cached = gitStatusCache.get(cwd);

  const [gitStatus, setGitStatus] = useState<GitStatusMap | null>(
    cached?.gitStatus ?? null,
  );
  const [baseBranch, setBaseBranch] = useState<string | null>(
    cached?.baseBranch ?? null,
  );
  const [branches, setBranches] = useState<Branch[]>(cached?.branches ?? []);
  const [isBranchSelectorOpen, setIsBranchSelectorOpen] = useState(false);
  const [isInGitRepo, setIsInGitRepo] = useState(cached?.isInGitRepo ?? false);
  const [currentBranch, setCurrentBranch] = useState<string | null>(
    cached?.currentBranch ?? null,
  );

  // Update cache whenever state changes
  useEffect(() => {
    if (cwd) {
      gitStatusCache.set(cwd, {
        gitStatus,
        currentBranch,
        baseBranch,
        branches,
        isInGitRepo,
      });
    }
  }, [cwd, gitStatus, currentBranch, baseBranch, branches, isInGitRepo]);

  // Load initial git status and branches on mount/cwd change
  useEffect(() => {
    if (!cwd) return;

    // Load initial git status
    if (api.getGitStatus) {
      api
        .getGitStatus(cwd)
        .then((response) => {
          if (response.success && response.gitStatus) {
            const gitStatusMap = new Map(Object.entries(response.gitStatus));
            setGitStatus(gitStatusMap);
            // Note: Don't set isInGitRepo here - getCurrentBranch is the definitive source
          } else if (response.error) {
            console.error(
              "[useGitStatus] Failed to load git status:",
              response.error,
            );
          }
        })
        .catch((error) => {
          console.error("[useGitStatus] Failed to load git status:", error);
        });
    }

    // Load branches
    if (api.getBranches) {
      api
        .getBranches(cwd)
        .then((response) => {
          if (response.success && response.branches) {
            setBranches(response.branches);
            // Note: Don't set isInGitRepo here - getCurrentBranch is the definitive source
          } else if (response.error) {
            console.error(
              "[useGitStatus] Failed to load branches:",
              response.error,
            );
          }
        })
        .catch((error) => {
          console.error("[useGitStatus] Failed to load branches:", error);
        });
    }

    // Load current branch - THIS IS THE DEFINITIVE SOURCE for isInGitRepo
    if (api.getCurrentBranch) {
      api
        .getCurrentBranch(cwd)
        .then((branch) => {
          setCurrentBranch(branch);
          // Only source of truth for isInGitRepo
          setIsInGitRepo(!!branch);
        })
        .catch((error) => {
          console.error("[useGitStatus] Failed to get current branch:", error);
          setIsInGitRepo(false);
        });
    }
  }, [cwd]);

  // Listen for git status changes
  useEffect(() => {
    if (!cwd) return;

    let removeGitStatusListener: (() => void) | undefined;
    let isInitialLoad = true;

    if (api.onGitStatusChanged) {
      removeGitStatusListener = api.onGitStatusChanged((payload) => {
        // Only handle events for this cwd
        if (payload.cwd !== cwd) {
          return;
        }

        // Convert plain object to Map if needed
        const statusMap = payload.gitStatus
          ? new Map(Object.entries(payload.gitStatus))
          : null;

        // Update git status
        setGitStatus(statusMap);

        // Always update current branch when it changes
        // Also update isInGitRepo since currentBranch is the source of truth
        if (payload.currentBranch !== undefined) {
          setCurrentBranch(payload.currentBranch);
          setIsInGitRepo(!!payload.currentBranch);
        }

        // Only update base branch on initial load, not on subsequent updates
        // User's branch selection should persist across git status updates
        if (isInitialLoad && payload.baseBranch !== undefined) {
          setBaseBranch(payload.baseBranch);
          isInitialLoad = false;
        }
      });
    }

    return () => {
      removeGitStatusListener?.();
    };
  }, [cwd]);

  // Handle branch selection
  const handleBranchSelect = useCallback(
    async (branchName: string | null) => {
      if (!api.setBaseBranch) {
        console.error("[useGitStatus] api.setBaseBranch is not defined");
        return;
      }

      try {
        await api.setBaseBranch(cwd, branchName);
        setBaseBranch(branchName);
        setIsBranchSelectorOpen(false);
      } catch (error) {
        console.error("[useGitStatus] Failed to set base branch:", error);
      }
    },
    [cwd],
  );

  return {
    gitStatus,
    baseBranch,
    branches,
    isBranchSelectorOpen,
    isInGitRepo,
    currentBranch,
    setIsBranchSelectorOpen,
    handleBranchSelect,
  };
}
