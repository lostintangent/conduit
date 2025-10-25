import { useCallback, useEffect, useRef, useState } from "react";

type SaveWorkspaceDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
};

export function SaveWorkspaceDialog({
  isOpen,
  onClose,
  onSave,
}: SaveWorkspaceDialogProps) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setName("");

    const focusHandle = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => cancelAnimationFrame(focusHandle);
  }, [isOpen]);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      onSave(name.trim());
    },
    [name, onSave]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="w-[400px] max-w-[90vw] rounded-xl border border-white/10 bg-surface-elevated p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-3 text-lg font-semibold text-white">
          Save Workspace
        </h2>

        <p className="mb-3 text-sm text-white/70">
          Give this workspace a name (optional):
        </p>

        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g., Frontend Dev, API Testing..."
          className="w-full rounded-md border border-white/10 bg-input px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
        />

        <p className="mt-2 text-xs text-white/50">
          Leave empty to use date/time as name
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/20"
          >
            Save Layout
          </button>
        </div>
      </form>
    </div>
  );
}
