import { useCallback, useEffect, useRef, useState } from "react";

type TabTitleDialogProps = {
  isOpen: boolean;
  initialValue: string;
  onClose: () => void;
  onSave: (title: string) => void;
};

export const TabTitleDialog = ({
  isOpen,
  initialValue,
  onClose,
  onSave,
}: TabTitleDialogProps) => {
  const [title, setTitle] = useState(initialValue);
  useEffect(() => setTitle(initialValue), [initialValue]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
      ``;
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1001] p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <form
        className="bg-surface-elevated border border-border rounded-xl p-6 w-[min(360px,90vw)] flex flex-col gap-4"
        onSubmit={() => onSave(title.trim())}
      >
        <h2 className="m-0 text-[1.1rem] font-semibold">Change tab title</h2>
        <input
          autoFocus
          className="w-full py-2.5 px-3 rounded-lg border border-border-muted bg-input text-inherit font-[inherit] text-[0.95rem] focus:outline-2 focus:outline-[var(--color-focus-ring)] focus:outline-offset-2"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter a title..."
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-white/[0.08] border border-transparent rounded-lg py-1.5 px-3.5 text-inherit font-[inherit] text-[0.9rem] cursor-pointer transition-[background-color,border-color] duration-150 hover:bg-white/15"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bg-gradient-to-br from-accent-start to-accent-end border-transparent rounded-lg py-1.5 px-3.5 text-white font-[inherit] text-[0.9rem] cursor-pointer transition-[filter] duration-150 hover:brightness-105"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
};
