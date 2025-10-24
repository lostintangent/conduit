import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useState } from "react";

type OpenUrlDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (url: string) => void;
};

export function OpenUrlDialog({ isOpen, onClose, onSubmit }: OpenUrlDialogProps) {
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (isOpen) setInputValue("");
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] bg-surface-elevated border-white/10">
        <DialogHeader>
          <DialogTitle>Open web page</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={() => onSubmit(inputValue.trim())}
          className="space-y-4"
        >
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Enter URL to open..."
            className="w-full rounded-md border border-white/10 bg-input px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
          />
          <DialogFooter>
            <button
              type="submit"
              className="rounded-md border border-white/30 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30"
            >
              Open
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
