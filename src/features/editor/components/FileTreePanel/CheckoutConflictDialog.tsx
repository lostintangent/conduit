/**
 * CheckoutConflictDialog - Dialog shown when checkout would overwrite local changes.
 *
 * Mimics VS Code's behavior when trying to switch branches with uncommitted changes.
 * Provides three options:
 * - "Stash & Checkout": Stash changes, checkout, then restore stash
 * - "Force Checkout": Discard changes and force checkout
 * - "Cancel": Abort the checkout
 *
 * @example
 * ```tsx
 * <CheckoutConflictDialog
 *   isOpen={showConflictDialog}
 *   targetBranch="feature-branch"
 *   onStashAndCheckout={handleStashAndCheckout}
 *   onForceCheckout={handleForceCheckout}
 *   onCancel={() => setShowConflictDialog(false)}
 * />
 * ```
 */

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface CheckoutConflictDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;

  /** Name of the branch being switched to */
  targetBranch: string;

  /** Whether an operation is in progress */
  isLoading?: boolean;

  /** Callback for "Stash & Checkout" action */
  onStashAndCheckout: () => void;

  /** Callback for "Force Checkout" action */
  onForceCheckout: () => void;

  /** Callback for "Cancel" action */
  onCancel: () => void;
}

/**
 * Dialog for handling checkout conflicts with uncommitted changes.
 */
export function CheckoutConflictDialog({
  isOpen,
  targetBranch,
  isLoading = false,
  onStashAndCheckout,
  onForceCheckout,
  onCancel,
}: CheckoutConflictDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent showClose={false} data-testid="checkout-conflict-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Uncommitted Changes
          </DialogTitle>
          <DialogDescription>
            Your local changes would be overwritten by checkout. You can stash
            your changes and restore them after switching to{" "}
            <span className="font-medium text-foreground">{targetBranch}</span>,
            or force checkout to discard them.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            data-testid="checkout-conflict-cancel"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onForceCheckout}
            disabled={isLoading}
            data-testid="checkout-conflict-force"
          >
            Force Checkout
          </Button>
          <Button
            onClick={onStashAndCheckout}
            disabled={isLoading}
            data-testid="checkout-conflict-stash"
          >
            {isLoading ? "Switching..." : "Stash & Checkout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
