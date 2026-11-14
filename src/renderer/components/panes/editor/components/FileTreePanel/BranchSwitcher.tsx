/**
 * BranchSwitcher - Dropdown for switching between branches.
 *
 * Unlike BranchSelector (which is for comparing branches), this component
 * allows actually switching the working directory to a different branch.
 *
 * Features:
 * - Dropdown showing available local branches
 * - Current branch shown as disabled
 * - Create new branch option at bottom of dropdown
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

import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { GitBranch, ChevronDown, Check, Plus } from "lucide-react";
import { gitMutations } from "@features/git/client/queries";
import type { GitSubscription } from "@features/git/client/GitSubscription";
import { cn } from "@/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CheckoutConflictDialog } from "./CheckoutConflictDialog";
import { useBranches } from "./hooks/useBranches";
import { useCreateBranch } from "./hooks/useCreateBranch";

export interface BranchSwitcherProps {
  /** Git API instance (shared from parent) */
  git: GitSubscription;

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

  // Use shared hook for branch loading
  const {
    branches: availableBranches,
    isLoading,
    error,
  } = useBranches(git, {
    enabled: isOpen,
    includeRemote: false,
    currentBranchFirst: true,
    currentBranch,
  });

  // Checkout conflict dialog state
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [pendingBranch, setPendingBranch] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const { mutateAsync: checkout, isPending: isSwitching } = useMutation(
    gitMutations.checkout(git.cwd),
  );

  // Create branch hook
  const { inputRef, ...createBranch } = useCreateBranch(git, {
    isOpen,
    onBranchCreated: (branchName) => {
      setIsOpen(false);
      onBranchSwitch?.(branchName);
    },
  });

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

      setCheckoutError(null);

      try {
        // Try normal checkout first
        await checkout({ branch });
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
          setCheckoutError(`Failed to checkout: ${errorMessage}`);
        }
      }
    },
    [checkout, currentBranch, onBranchSwitch],
  );

  /**
   * Handle "Stash & Checkout" - stash changes, checkout, pop stash.
   */
  const handleStashAndCheckout = useCallback(async () => {
    if (!pendingBranch) return;

    setCheckoutError(null);

    try {
      await checkout({ branch: pendingBranch, localChanges: "stash" });
      setShowConflictDialog(false);
      setPendingBranch(null);
      setIsOpen(false);
      onBranchSwitch?.(pendingBranch);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setCheckoutError(`Failed to stash and checkout: ${errorMessage}`);
    }
  }, [checkout, pendingBranch, onBranchSwitch]);

  /**
   * Handle "Force Checkout" - discard local changes and checkout.
   */
  const handleForceCheckout = useCallback(async () => {
    if (!pendingBranch) return;

    setCheckoutError(null);

    try {
      await checkout({ branch: pendingBranch, localChanges: "discard" });
      setShowConflictDialog(false);
      setPendingBranch(null);
      setIsOpen(false);
      onBranchSwitch?.(pendingBranch);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setCheckoutError(`Failed to force checkout: ${errorMessage}`);
    }
  }, [checkout, pendingBranch, onBranchSwitch]);

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
          className="min-w-[200px] flex flex-col"
          data-testid="branch-switcher-dropdown"
          onEscapeKeyDown={(e) => {
            // When in create mode, prevent dropdown from closing on Escape
            // The input's handler will reset the create state instead
            if (createBranch.isCreating) {
              e.preventDefault();
            }
          }}
        >
          {/* Scrollable branch list */}
          <div className="max-h-[250px] overflow-auto">
            {isLoading ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                Loading branches...
              </div>
            ) : error || checkoutError ? (
              <div className="px-3 py-2 text-sm text-destructive">
                {error || checkoutError}
              </div>
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
          </div>

          {/* Pinned: Separator and Create Branch option */}
          <DropdownMenuSeparator />

          {createBranch.isCreating ? (
            <div className="px-2 py-1.5">
              <input
                ref={inputRef}
                type="text"
                value={createBranch.branchName}
                onChange={(e) => createBranch.setBranchName(e.target.value)}
                onKeyDown={createBranch.handleKeyDown}
                placeholder="Branch name..."
                className={cn(
                  "w-full px-2 py-1 text-sm rounded",
                  "bg-background border border-input",
                  "focus:outline-none focus:ring-1 focus:ring-ring",
                  "placeholder:text-muted-foreground",
                )}
                disabled={createBranch.isSubmitting}
                data-testid="create-branch-input"
              />
              {createBranch.error && (
                <div className="mt-1 text-xs text-destructive truncate">
                  {createBranch.error}
                </div>
              )}
            </div>
          ) : (
            <DropdownMenuItem
              className="flex items-center gap-2"
              disabled={isSwitching}
              onSelect={(e) => {
                e.preventDefault();
                createBranch.startCreating();
              }}
              data-testid="create-branch-option"
            >
              <Plus className="w-4 h-4 flex-shrink-0" />
              <span>Create new branch...</span>
            </DropdownMenuItem>
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
