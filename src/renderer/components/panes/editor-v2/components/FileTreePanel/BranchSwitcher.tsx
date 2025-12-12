/**
 * BranchSwitcher - Dropdown for switching between branches.
 *
 * Unlike BranchSelector (which is for comparing branches), this component
 * allows actually switching the working directory to a different branch.
 *
 * Features:
 * - Dropdown showing available local branches
 * - Current branch shown as disabled
 * - Handles checkout conflicts with VS Code-like UX:
 *   - Stash & Checkout
 *   - Force Checkout
 *   - Cancel
 *
 * @example
 * ```tsx
 * <BranchSwitcher
 *   git={git}
 *   currentBranch="main"
 *   onBranchSwitch={handleBranchSwitch}
 * />
 * ```
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { GitBranch, ChevronDown, Check } from "lucide-react";
import type { GitV2API } from "@/api/GitV2API";
import type { GitBranch as GitBranchType } from "@/../../src/ipc/gitv2/types";
import { cn } from "@/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CheckoutConflictDialog } from "./CheckoutConflictDialog";

export interface BranchSwitcherProps {
  /** Git API instance (shared from parent) */
  git: GitV2API;

  /** Current branch name */
  currentBranch: string | null;

  /** Callback after successful branch switch */
  onBranchSwitch?: (newBranch: string) => void;
}

/**
 * Branch switcher dropdown with checkout conflict handling.
 */
export function BranchSwitcher({
  git,
  currentBranch,
  onBranchSwitch,
}: BranchSwitcherProps) {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [isOpen, setIsOpen] = useState(false);
  const [branches, setBranches] = useState<GitBranchType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Checkout conflict dialog state
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [pendingBranch, setPendingBranch] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  // ---------------------------------------------------------------------------
  // Load Branches
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    async function loadBranches() {
      setIsLoading(true);
      setError(null);
      try {
        await git.whenReady();
        if (cancelled) return;

        const branchList = await git.getBranches();
        if (!cancelled) {
          setBranches(branchList);
        }
      } catch (err) {
        console.error("Failed to load branches:", err);
        if (!cancelled) {
          setError("Failed to load branches");
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
  }, [git, isOpen]);

  // ---------------------------------------------------------------------------
  // Available Branches (filtered)
  // ---------------------------------------------------------------------------

  /**
   * Filter branches for display.
   * - Only show local branches
   * - Sort by last commit date (most recent first), current branch always first
   */
  const availableBranches = useMemo(() => {
    return branches
      .filter((b) => !b.isRemote)
      .sort((a, b) => {
        // Current branch first
        if (a.name === currentBranch) return -1;
        if (b.name === currentBranch) return 1;

        // Sort by last commit date (most recent first)
        const dateA = a.lastCommitDate
          ? new Date(a.lastCommitDate).getTime()
          : 0;
        const dateB = b.lastCommitDate
          ? new Date(b.lastCommitDate).getTime()
          : 0;
        return dateB - dateA;
      });
  }, [branches, currentBranch]);

  // ---------------------------------------------------------------------------
  // Checkout Handlers
  // ---------------------------------------------------------------------------

  /**
   * Attempt to checkout a branch.
   * If there are uncommitted changes, shows the conflict dialog.
   */
  const handleSelectBranch = useCallback(
    async (branch: string) => {
      if (branch === currentBranch) return;

      setIsSwitching(true);
      setError(null);

      try {
        // Try normal checkout first
        await git.checkout(branch);
        setIsOpen(false);
        onBranchSwitch?.(branch);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        // Check if the error is about local changes being overwritten
        if (
          errorMessage.includes("local changes") ||
          errorMessage.includes("overwritten") ||
          errorMessage.includes("uncommitted") ||
          errorMessage.includes("would be overwritten")
        ) {
          // Show conflict dialog
          setPendingBranch(branch);
          setShowConflictDialog(true);
        } else {
          setError(`Failed to checkout: ${errorMessage}`);
        }
      } finally {
        setIsSwitching(false);
      }
    },
    [git, currentBranch, onBranchSwitch],
  );

  /**
   * Handle "Stash & Checkout" - stash changes, checkout, pop stash.
   */
  const handleStashAndCheckout = useCallback(async () => {
    if (!pendingBranch) return;

    setIsSwitching(true);
    setError(null);

    try {
      // Stash current changes
      await git.stash(`Auto-stash before switching to ${pendingBranch}`);

      // Checkout the target branch
      await git.checkout(pendingBranch);

      // Pop the stash to restore changes
      try {
        await git.stashPop();
      } catch (popError) {
        // If stash pop fails (e.g., conflicts), warn but don't fail
        console.warn("Stash pop had conflicts:", popError);
        // The user will see merge conflicts in their working directory
      }

      setShowConflictDialog(false);
      setPendingBranch(null);
      setIsOpen(false);
      onBranchSwitch?.(pendingBranch);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to stash and checkout: ${errorMessage}`);
    } finally {
      setIsSwitching(false);
    }
  }, [git, pendingBranch, onBranchSwitch]);

  /**
   * Handle "Force Checkout" - discard local changes and checkout.
   */
  const handleForceCheckout = useCallback(async () => {
    if (!pendingBranch) return;

    setIsSwitching(true);
    setError(null);

    try {
      await git.checkout(pendingBranch, true); // force = true
      setShowConflictDialog(false);
      setPendingBranch(null);
      setIsOpen(false);
      onBranchSwitch?.(pendingBranch);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to force checkout: ${errorMessage}`);
    } finally {
      setIsSwitching(false);
    }
  }, [git, pendingBranch, onBranchSwitch]);

  /**
   * Handle "Cancel" - close the conflict dialog.
   */
  const handleCancelConflict = useCallback(() => {
    setShowConflictDialog(false);
    setPendingBranch(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!currentBranch) {
    return null;
  }

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-1 px-1 py-0.5 rounded text-xs",
              "hover:bg-accent/50 transition-colors",
              "cursor-pointer",
              isOpen && "bg-accent/50",
            )}
            title="Click to switch branches"
            data-testid="branch-switcher-trigger"
          >
            <GitBranch className="w-3 h-3 flex-shrink-0" />
            <span className="truncate max-w-[100px]">{currentBranch}</span>
            <ChevronDown className="w-3 h-3 flex-shrink-0" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          className="min-w-[200px] max-h-[300px] overflow-auto"
          data-testid="branch-switcher-dropdown"
        >
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Loading branches...
            </div>
          ) : error ? (
            <div className="px-3 py-2 text-sm text-destructive">{error}</div>
          ) : availableBranches.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No branches found
            </div>
          ) : (
            availableBranches.map((branch) => {
              const isCurrent = branch.name === currentBranch;
              return (
                <DropdownMenuItem
                  key={branch.name}
                  className={cn(
                    "flex items-center gap-2",
                    isCurrent && "text-muted-foreground",
                    isSwitching && "opacity-50 cursor-wait",
                  )}
                  disabled={isCurrent || isSwitching}
                  onSelect={(e) => {
                    if (isCurrent) {
                      e.preventDefault();
                      return;
                    }
                    // Prevent the menu from closing immediately
                    e.preventDefault();
                    handleSelectBranch(branch.name);
                  }}
                  data-testid={`branch-option-${branch.name}`}
                >
                  <span className="w-4 flex-shrink-0">
                    {isCurrent && <Check className="w-3.5 h-3.5" />}
                  </span>
                  <span className="truncate">{branch.name}</span>
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Checkout Conflict Dialog */}
      <CheckoutConflictDialog
        isOpen={showConflictDialog}
        targetBranch={pendingBranch ?? ""}
        isLoading={isSwitching}
        onStashAndCheckout={handleStashAndCheckout}
        onForceCheckout={handleForceCheckout}
        onCancel={handleCancelConflict}
      />
    </>
  );
}
