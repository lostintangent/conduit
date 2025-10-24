import { useCallback, useEffect, useRef, useState } from "react";

type UrlDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (url: string) => void;
};

export function UrlDialog({ isOpen, onClose, onSubmit }: UrlDialogProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setInputValue("");

    const focusHandle = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => cancelAnimationFrame(focusHandle);
  }, [isOpen]);

  const handleSubmit = useCallback(() => {
    const trimmedUrl = inputValue.trim();
    // If empty, use default URL
    const finalUrl =
      trimmedUrl.length > 0 ? trimmedUrl : "https://www.google.com";
    onSubmit(finalUrl);
  }, [inputValue, onSubmit]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();

      const key = event.key.toLowerCase();

      if (key === "escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (key === "enter") {
        event.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, onClose]
  );

  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        className="w-[480px] max-w-[90vw] rounded-xl border border-white/10 bg-surface-elevated p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-white">Open web page</h2>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter URL (or leave empty for default page)"
          className="w-full rounded-md border border-white/10 bg-input px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-md border border-white/30 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}
