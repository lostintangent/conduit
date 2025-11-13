import type { Branch, GitStatusMap } from "@shared/types";
import { useCallback, useEffect, useState } from "react";

const api = window.conduit;

export function useGitStatus(cwd: string) {
  const [gitStatus, setGitStatus] = useState<GitStatusMap | null>(null);
  const [baseBranch, setBaseBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isBranchSelectorOpen, setIsBranchSelectorOpen] = useState(false);
  const [isInGitRepo, setIsInGitRepo] = useState(false);

  // Load initial git status and branches on mount/cwd change
  useEffect(() => {
    if (!cwd) return;

    // Load initial git status
    if (api.getGitStatus) {
      api
        .getGitStatus(cwd)
        .then((response) => {
          console.log("[useGitStatus] getGitStatus response:", response);
          if (response.success && response.gitStatus) {
            const gitStatusMap = new Map(Object.entries(response.gitStatus));
            console.log(
              "[useGitStatus] Loaded initial git status",
              gitStatusMap.size,
            );
            setGitStatus(gitStatusMap);
            setIsInGitRepo(true);
          } else if (response.error) {
            console.error(
              "[useGitStatus] Failed to load git status:",
              response.error,
            );
            setIsInGitRepo(false);
          } else {
            console.log("[useGitStatus] Not in git repo or no git status");
            setIsInGitRepo(false);
          }
        })
        .catch((error) => {
          console.error("[useGitStatus] Failed to load git status:", error);
          setIsInGitRepo(false);
        });
    }

    // Load branches if in git repo
    if (api.getBranches) {
      api
        .getBranches(cwd)
        .then((response) => {
          console.log("[useGitStatus] getBranches response:", response);
          if (response.success && response.branches) {
            console.log(
              "[useGitStatus] Loaded branches:",
              response.branches.length,
            );
            setBranches(response.branches);
            setIsInGitRepo(true);
          } else if (response.error) {
            console.error(
              "[useGitStatus] Failed to load branches:",
              response.error,
            );
          } else {
            console.log("[useGitStatus] No branches found");
          }
        })
        .catch((error) => {
          console.error("[useGitStatus] Failed to load branches:", error);
        });
    }
  }, [cwd]);

  // Listen for git status changes
  useEffect(() => {
    if (!cwd) return;

    let removeGitStatusListener: (() => void) | undefined;

    if (api.onGitStatusChanged) {
      console.log("[useGitStatus] Setting up git status change listener");
      removeGitStatusListener = api.onGitStatusChanged((payload) => {
        // Only handle events for this cwd
        if (payload.cwd !== cwd) {
          return;
        }

        // Convert plain object to Map if needed
        const statusMap = payload.gitStatus
          ? new Map(Object.entries(payload.gitStatus))
          : null;

        console.log(
          `[useGitStatus] Git status changed for cwd=${cwd}, size=${statusMap?.size ?? 0}`,
        );

        // Update git status
        setGitStatus(statusMap);
        setBaseBranch(payload.baseBranch);
      });
    } else {
      console.warn("[useGitStatus] api.onGitStatusChanged is not defined");
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
        console.log("[useGitStatus] Setting base branch to:", branchName);
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
    setIsBranchSelectorOpen,
    handleBranchSelect,
  };
}
