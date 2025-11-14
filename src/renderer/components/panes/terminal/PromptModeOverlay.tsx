import React, { useEffect, useRef, useState } from "react";

interface PromptModeOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
  isProcessing: boolean;
  response?: string;
  error?: string;
}

export const PromptModeOverlay: React.FC<PromptModeOverlayProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isProcessing,
}) => {
  const [promptValue, setPromptValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setPromptValue("");
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (promptValue.trim() && !isProcessing) {
      onSubmit(promptValue.trim());
      setPromptValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-50 border-t border-border bg-surface/95 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-3 py-2"
      >
        <span className="text-xs font-medium text-accent">❯</span>
        <input
          ref={inputRef}
          type="text"
          value={promptValue}
          onChange={(e) => setPromptValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isProcessing ? "Processing..." : "Ask a question... (Esc to exit)"
          }
          className="flex-1 px-2 py-1 bg-transparent text-foreground placeholder:text-foreground/50 focus:outline-none text-sm"
          disabled={isProcessing}
        />
        {isProcessing && (
          <svg
            className="w-4 h-4 animate-spin text-accent"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
      </form>
    </div>
  );
};
