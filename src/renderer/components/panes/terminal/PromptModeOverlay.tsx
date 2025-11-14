import React, { useState, useEffect, useRef } from "react";

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
  response,
  error,
}) => {
  const [promptValue, setPromptValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (promptValue.trim() && !isProcessing) {
      onSubmit(promptValue.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-surface/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="text-sm font-medium text-foreground">
          Terminal Assistant (Prompt Mode)
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-surfaceMuted rounded transition-colors"
          aria-label="Close prompt mode"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Response Area */}
      {(response || error || isProcessing) && (
        <div className="flex-1 overflow-auto p-4">
          {isProcessing && (
            <div className="flex items-center gap-2 text-foreground">
              <svg
                className="w-4 h-4 animate-spin"
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
              <span>Processing your request...</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
              <strong>Error:</strong> {error}
            </div>
          )}

          {response && (
            <div className="prose prose-invert prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-foreground bg-surfaceMuted p-3 rounded border border-border">
                {response}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Prompt Input */}
      <div className="border-t border-border p-4">
        <form onSubmit={handleSubmit}>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your terminal session... (e.g., 'How do I setup a RAID array?')"
              className="flex-1 px-3 py-2 bg-input border border-border rounded text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent"
              disabled={isProcessing}
            />
            <button
              type="submit"
              disabled={!promptValue.trim() || isProcessing}
              className="px-4 py-2 bg-accent text-foregroundInverse rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {isProcessing ? "Processing..." : "Ask"}
            </button>
          </div>
          <div className="mt-2 text-xs text-foreground/60">
            Press{" "}
            <kbd className="px-1 py-0.5 bg-surfaceMuted border border-border rounded">
              Escape
            </kbd>{" "}
            to close
          </div>
        </form>
      </div>
    </div>
  );
};
