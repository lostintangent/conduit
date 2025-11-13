import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useState } from "react";

type InputDialogProps = {
  isOpen: boolean;
  initialValue: string;
  onClose: () => void;
  onSave: (value: string) => void;
  title: string;
  placeholder: string;
};

export function InputDialog({
  isOpen,
  initialValue = "",
  onClose,
  onSave,
  title,
  placeholder,
}: InputDialogProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (isOpen) setValue(initialValue);
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] bg-popover border-border">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={() => onSave(value)}>
          <input
            autoFocus
            className="w-full py-2.5 px-3 rounded-lg border border-muted bg-input text-inherit font-[inherit] text-[0.95rem] focus:outline-2 focus:outline-ring focus:outline-offset-2"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
          />
          <DialogFooter className="mt-4">
            <button
              type="submit"
              className="magic border-transparent rounded-lg py-1.5 px-3.5 text-[0.9rem] cursor-pointer transition-[filter] duration-150 hover:brightness-105"
            >
              Save
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
