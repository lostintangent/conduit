import { clearPressedKeys } from "@/commands/keybindings/parser";
import {
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  RotateCcw,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

interface AgentPanelProps {
  isOpen: boolean;
  isProcessing: boolean;
  onClose: () => void;
  onSubmit: (prompt: string, agentId?: string) => void;
  onClearHistory?: () => void;
  content: string;
  error?: string;
}

type PanelPosition = "top" | "bottom";

export const AgentPanel: React.FC<AgentPanelProps> = ({
  isOpen,
  isProcessing,
  onClose,
  onSubmit,
  onClearHistory,
  content,
  error,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [promptValue, setPromptValue] = useState("");
  const [position, setPosition] = useState<PanelPosition>("bottom");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number>(0);
  const dragStartPosition = useRef<PanelPosition>("bottom");

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Clear prompt when panel opens
  useEffect(() => {
    if (isOpen) {
      setPromptValue("");
    }
  }, [isOpen]);

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (promptValue.trim() && !isProcessing) {
      const trimmed = promptValue.trim();

      // Parse slash command (e.g., "/claude how do I...?" or "/codex fix this")
      const slashCommandMatch = trimmed.match(/^\/(\w+)\s+(.+)$/);

      if (slashCommandMatch) {
        const [, agentId, actualPrompt] = slashCommandMatch;
        onSubmit(actualPrompt, agentId);
      } else {
        // No slash command, use default agent
        onSubmit(trimmed);
      }

      setPromptValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !isProcessing) {
      clearPressedKeys();
      onClose();
    }
  };

  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartPosition.current = position;
    e.preventDefault();
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleDragMove = (e: MouseEvent) => {
      const deltaY = e.clientY - dragStartY.current;
      const threshold = 100; // pixels to drag before switching position

      if (dragStartPosition.current === "bottom" && deltaY < -threshold) {
        setPosition("top");
      } else if (dragStartPosition.current === "top" && deltaY > threshold) {
        setPosition("bottom");
      }
    };

    const handleDragEnd = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", handleDragEnd);

    return () => {
      document.removeEventListener("mousemove", handleDragMove);
      document.removeEventListener("mouseup", handleDragEnd);
    };
  }, [isDragging, position]);

  if (!isOpen) return null;

  const minimizedHeight = "200px";
  const maximizedHeight = "calc(100% - 48px)";

  const positionStyles =
    position === "bottom" ? { bottom: "8px" } : { top: "8px" };

  return (
    <div
      className="absolute left-2 right-2 z-50 flex flex-col rounded-lg border border-border bg-background/98 backdrop-blur-md shadow-lg overflow-hidden"
      style={{
        ...positionStyles,
        height: isMaximized ? maximizedHeight : minimizedHeight,
        transition: isDragging
          ? "none"
          : "height 0.2s ease-in-out, top 0.3s ease-in-out, bottom 0.3s ease-in-out",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-border bg-elevated/50 cursor-move"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal size={14} className="text-foreground/30" />
          <span className="text-xs font-medium text-accent">❯</span>
          <span className="text-xs font-medium text-foreground/70">Agent</span>
          {isProcessing && (
            <svg
              className="w-3 h-3 animate-spin text-accent"
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
        </div>
        <div className="flex items-center gap-1">
          {onClearHistory && content && (
            <button
              onClick={onClearHistory}
              disabled={isProcessing}
              className="p-1 rounded hover:bg-accent/20 text-foreground/50 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              title="Clear conversation history"
            >
              <RotateCcw size={14} />
            </button>
          )}
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 rounded hover:bg-accent/20 text-foreground/50 hover:text-foreground"
            title={isMaximized ? "Minimize" : "Maximize"}
          >
            {isMaximized ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1 rounded hover:bg-accent/20 text-foreground/50 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            title="Close (Esc)"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto px-3 py-2 text-sm font-mono whitespace-pre-wrap"
      >
        {error ? (
          <span className="text-red-400">{error}</span>
        ) : content ? (
          <span className="text-green-400">{content}</span>
        ) : (
          <span className="text-foreground/30 italic">
            Ask a question to get started...
          </span>
        )}
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-3 py-2 border-t border-border bg-elevated/30"
      >
        <span className="text-xs font-medium text-accent">❯</span>
        <input
          ref={inputRef}
          type="text"
          value={promptValue}
          onChange={(e) => setPromptValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isProcessing
              ? "Processing..."
              : "Ask a question... (use /agent for specific agent, Esc to close)"
          }
          className="flex-1 px-2 py-1 bg-transparent text-foreground placeholder:text-foreground/50 focus:outline-none text-sm"
          disabled={isProcessing}
        />
      </form>
    </div>
  );
};
