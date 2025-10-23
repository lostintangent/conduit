import { useEffect, useState } from "react";

type FocusModeInfoDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (dontShowAgain: boolean) => void;
};

export function FocusModeInfoDialog({
  isOpen,
  onClose,
  onConfirm,
}: FocusModeInfoDialogProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter") {
        onConfirm(dontShowAgain);
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [isOpen, onClose, onConfirm, dontShowAgain]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex w-[min(480px,90vw)] flex-col gap-4 rounded-xl border border-border bg-surface-elevated p-6">
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-[1.1rem] font-semibold">Focus Mode</h2>
          <p className="m-0 text-[0.95rem] text-white/70">
            Focus mode lets you maximize a single terminal pane to fill the
            entire window, while keeping your split layout intact.
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-border-muted bg-white/5 p-3 text-[0.9rem]">
          <div className="flex items-start gap-2">
            <kbd className="mt-0.5 shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-mono">
              ⌘⇧F
            </kbd>
            <span className="text-white/70">
              Enter or exit focus mode on the active terminal
            </span>
          </div>
          <div className="flex items-start gap-2">
            <kbd className="mt-0.5 shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-mono">
              ⌘⇧D
            </kbd>
            <span className="text-white/70">
              Navigate to the next terminal (while in focus mode)
            </span>
          </div>
          <div className="flex items-start gap-2">
            <kbd className="mt-0.5 shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-mono">
              ⌘⇧G
            </kbd>
            <span className="text-white/70">
              Navigate to the previous terminal (while in focus mode)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[0.9rem]">
          <input
            type="checkbox"
            id="dont-show-again"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-border-muted"
          />
          <label
            htmlFor="dont-show-again"
            className="cursor-pointer text-white/70"
          >
            Don't show this again
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-transparent bg-white/[0.08] px-3.5 py-1.5 text-[0.9rem] font-[inherit] text-inherit transition-[background-color,border-color] duration-150 hover:bg-white/15"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(dontShowAgain)}
            className="rounded-lg border-transparent bg-gradient-to-br from-accent-start to-accent-end px-3.5 py-1.5 text-[0.9rem] font-[inherit] text-white transition-[filter] duration-150 hover:brightness-105"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
