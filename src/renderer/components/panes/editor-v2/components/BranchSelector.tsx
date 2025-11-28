/**
 * BranchSelector - Dropdown for selecting a branch to compare against.
 *
 * Enables branch comparison mode in the editor by selecting a base branch.
 * When a branch is selected, the file tree and diff views show changes
 * relative to that branch instead of HEAD.
 *
 * Features:
 * - Dropdown showing available branches
 * - "Compare to..." placeholder
 * - Clear comparison button
 * - Shows current branch as disabled (can't compare to self)
 *
 * @example
 * ```tsx
 * <BranchSelector
 *   cwd="/project"
 *   baseBranch={baseBranch}
 *   onBaseBranchChange={setBaseBranch}
 * />
 * ```
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { GitBranch, X, ChevronDown, AlertCircle } from "lucide-react";
import { useGitV2 } from "@/hooks/useGitV2";
import { useGitAvailable } from "@/hooks/useGitAvailable";
import type { GitBranch as GitBranchType } from "@/../../src/ipc/gitv2/types";
import { cn } from "@/utils";

// ============================================================================
// Types
// ============================================================================

export interface BranchSelectorProps {
  /** Working directory */
  cwd: string;

  /** Currently selected base branch for comparison (null = no comparison) */
  baseBranch: string | null;

  /** Callback when base branch changes */
  onBaseBranchChange: (branch: string | null) => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Branch selector dropdown for comparison mode.
 */
export function BranchSelector({
  cwd,
  baseBranch,
  onBaseBranchChange,
}: BranchSelectorProps) {
  const { isAvailable: isGitAvailable, isLoading: isCheckingGit } =
    useGitAvailable();
  const git = useGitV2(cwd);

  // State
  const [branches, setBranches] = useState<GitBranchType[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isGitError, setIsGitError] = useState(false);

  // ---------------------------------------------------------------------------
  // Load Branches
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function loadBranches() {
      // Don't load if git is not available
      if (!isGitAvailable || isCheckingGit) {
        return;
      }

      setIsLoading(true);
      setIsGitError(false);
      try {
        const [branchList, current] = await Promise.all([
          git.getBranches(),
          git.getCurrentBranch(),
        ]);

        if (!cancelled) {
          // If both are empty/null, likely not a git repo
          if (branchList.length === 0 && current === null) {
            setIsGitError(true);
          } else {
            setBranches(branchList);
            setCurrentBranch(current);
          }
        }
      } catch (error) {
        console.error("Failed to load branches:", error);
        if (!cancelled) {
          setIsGitError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadBranches();

    return () => {
      cancelled = true;
    };
  }, [git, isGitAvailable, isCheckingGit]);

  // ---------------------------------------------------------------------------
  // Subscribe to Branch Changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const cleanup = git.onBranchChanged((event) => {
      setCurrentBranch(event.currentBranch);
    });

    return cleanup;
  }, [git]);

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  /**
   * Filter branches for display.
   * - Exclude the current branch (can't compare to self)
   * - Sort local branches first, then remote
   */
  const availableBranches = useMemo(() => {
    return branches
      .filter((b) => b.name !== currentBranch && !b.isRemote)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [branches, currentBranch]);

  /**
   * Remote branches for display.
   */
  const remoteBranches = useMemo(() => {
    return branches
      .filter((b) => b.isRemote && b.name !== currentBranch)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [branches, currentBranch]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSelectBranch = useCallback(
    (branch: string) => {
      onBaseBranchChange(branch);
      setIsOpen(false);
    },
    [onBaseBranchChange],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onBaseBranchChange(null);
    },
    [onBaseBranchChange],
  );

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleClickOutside = useCallback(() => {
    setIsOpen(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Git not installed - show disabled state
  if (!isCheckingGit && !isGitAvailable) {
    return (
      <div
        className="flex items-center gap-1 px-2 py-1 text-sm text-muted-foreground/50 cursor-not-allowed"
        data-testid="branch-selector-git-unavailable"
        title="Git is not installed"
      >
        <AlertCircle className="w-4 h-4" />
        <span>Git unavailable</span>
      </div>
    );
  }

  // Not a git repo or error - show disabled state
  if (isGitError) {
    return (
      <div
        className="flex items-center gap-1 px-2 py-1 text-sm text-muted-foreground/50 cursor-not-allowed"
        data-testid="branch-selector-not-repo"
        title="Not a Git repository"
      >
        <GitBranch className="w-4 h-4" />
        <span>No branches</span>
      </div>
    );
  }

  if (isLoading || isCheckingGit) {
    return (
      <div
        className="flex items-center gap-1 px-2 py-1 text-sm text-muted-foreground"
        data-testid="branch-selector-loading"
      >
        <GitBranch className="w-4 h-4" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="relative" data-testid="branch-selector">
      {/* Trigger Container - use flex layout with separate clickable elements */}
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-md text-sm",
          baseBranch
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground",
        )}
      >
        {/* Main clickable area for opening dropdown */}
        <div
          className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={handleToggle}
          data-testid="branch-selector-trigger"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && handleToggle()}
        >
          <GitBranch className="w-4 h-4" />
          <span className="max-w-[120px] truncate">
            {baseBranch || "Compare to..."}
          </span>
          {!baseBranch && <ChevronDown className="w-3 h-3 ml-1" />}
        </div>
        {/* Clear button - separate from the toggle trigger */}
        {baseBranch && (
          <button
            className="flex items-center justify-center h-4 w-4 ml-1 rounded hover:bg-accent-foreground/10 transition-colors"
            onClick={handleClear}
            title="Clear comparison"
            data-testid="branch-selector-clear"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop for click-outside */}
          <div
            className="fixed inset-0 z-10"
            onClick={handleClickOutside}
            data-testid="branch-selector-backdrop"
          />

          {/* Dropdown Menu */}
          <div
            className={cn(
              "absolute left-0 top-full mt-1 z-20",
              "min-w-[180px] max-h-[300px] overflow-auto",
              "bg-popover border border-border rounded-md shadow-md",
              "py-1",
            )}
            data-testid="branch-selector-dropdown"
          >
            {/* Local Branches */}
            {availableBranches.length > 0 && (
              <div>
                <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                  Local Branches
                </div>
                {availableBranches.map((branch) => (
                  <button
                    key={branch.name}
                    className={cn(
                      "w-full px-2 py-1.5 text-sm text-left",
                      "hover:bg-accent/50 transition-colors",
                      branch.name === baseBranch && "bg-accent",
                    )}
                    onClick={() => handleSelectBranch(branch.name)}
                    data-testid={`branch-option-${branch.name}`}
                  >
                    {branch.name}
                  </button>
                ))}
              </div>
            )}

            {/* Remote Branches */}
            {remoteBranches.length > 0 && (
              <div
                className={
                  availableBranches.length > 0
                    ? "border-t border-border mt-1 pt-1"
                    : ""
                }
              >
                <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                  Remote Branches
                </div>
                {remoteBranches.map((branch) => (
                  <button
                    key={branch.name}
                    className={cn(
                      "w-full px-2 py-1.5 text-sm text-left",
                      "hover:bg-accent/50 transition-colors",
                      branch.name === baseBranch && "bg-accent",
                    )}
                    onClick={() => handleSelectBranch(branch.name)}
                    data-testid={`branch-option-${branch.name}`}
                  >
                    {branch.name}
                  </button>
                ))}
              </div>
            )}

            {/* Empty State */}
            {availableBranches.length === 0 && remoteBranches.length === 0 && (
              <div className="px-2 py-2 text-sm text-muted-foreground">
                No other branches available
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
