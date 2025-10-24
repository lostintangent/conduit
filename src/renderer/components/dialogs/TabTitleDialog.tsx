import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useState } from "react";

type TabTitleDialogProps = {
  isOpen: boolean;
  initialValue: string;
  onClose: () => void;
  onSave: (title: string) => void;
};

export function TabTitleDialog({
  isOpen,
  initialValue = "",
  onClose,
  onSave,
}: TabTitleDialogProps) {
  const [title, setTitle] = useState(initialValue);

  useEffect(() => {
    if (isOpen) setTitle(initialValue);
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] bg-surface-elevated border-border">
        <DialogHeader>
          <DialogTitle>Change tab title</DialogTitle>
        </DialogHeader>

        <form onSubmit={() => onSave(title)}>
          <input
            autoFocus
            className="w-full py-2.5 px-3 rounded-lg border border-border-muted bg-input text-inherit font-[inherit] text-[0.95rem] focus:outline-2 focus:outline-[var(--color-focus-ring)] focus:outline-offset-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter a title..."
          />
          <DialogFooter className="mt-4">
            <button
              type="submit"
              className="bg-gradient-to-br from-accent-start to-accent-end border-transparent rounded-lg py-1.5 px-3.5 text-white font-[inherit] text-[0.9rem] cursor-pointer transition-[filter] duration-150 hover:brightness-105"
            >
              Save
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
