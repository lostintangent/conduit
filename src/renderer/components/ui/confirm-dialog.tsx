/**
 * ConfirmDialog - A reusable confirmation dialog component.
 *
 * Used for destructive actions that require user confirmation,
 * such as deleting files or folders.
 *
 * @example
 * ```tsx
 * <ConfirmDialog
 *   isOpen={showDeleteConfirm}
 *   title="Delete File"
 *   description="Are you sure you want to delete this file? This action cannot be undone."
 *   confirmLabel="Delete"
 *   onConfirm={() => handleDelete()}
 *   onCancel={() => setShowDeleteConfirm(false)}
 *   variant="destructive"
 * />
 * ```
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ConfirmDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;

  /** Dialog title */
  title: string;

  /** Dialog description/message */
  description: string;

  /** Label for the confirm button */
  confirmLabel?: string;

  /** Label for the cancel button */
  cancelLabel?: string;

  /** Callback when user confirms */
  onConfirm: () => void;

  /** Callback when user cancels (or closes dialog) */
  onCancel: () => void;

  /**
   * Visual variant for the confirm button.
   * Use "destructive" for delete operations.
   */
  variant?: "default" | "destructive";
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  variant = "default",
}: ConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[425px]" showClose={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            onClick={() => {
              onConfirm();
            }}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
