import type { FileMatch } from "@/utils/quickOpenFiltering";
import { useEffect, useRef } from "react";

interface QuickOpenOverlayProps {
  visible: boolean;
  query: string;
  results: FileMatch[];
  activeIndex: number;
  isLoading: boolean;
  onQueryChange: (query: string) => void;
  onActiveIndexChange: (index: number) => void;
  onSelect: (file: FileMatch) => void;
  onClose: () => void;
}

export function QuickOpenOverlay({
  visible,
  query,
  results,
  activeIndex,
  isLoading,
  onQueryChange,
  onActiveIndexChange,
  onSelect,
  onClose,
}: QuickOpenOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when opened
  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [visible]);

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          onActiveIndexChange(Math.min(activeIndex + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          onActiveIndexChange(Math.max(activeIndex - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[activeIndex]) {
            onSelect(results[activeIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, activeIndex, results, onActiveIndexChange, onSelect, onClose]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        role="button"
        tabIndex={-1}
        aria-label="Close quick open"
      />

      {/* Dialog */}
      <div className="relative w-full max-w-2xl mx-4 bg-white dark:bg-gray-800 rounded-lg shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Type to search files..."
            className="w-full px-3 py-2 bg-transparent border-none outline-none text-lg dark:text-white"
          />
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {isLoading && results.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              Loading files...
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No files found</div>
          ) : (
            results.map((result, idx) => (
              <div
                key={result.absolutePath}
                className={`
                  px-4 py-2 cursor-pointer transition-colors
                  ${
                    idx === activeIndex
                      ? "bg-blue-100 dark:bg-blue-900"
                      : "hover:bg-gray-100 dark:hover:bg-gray-700"
                  }
                `}
                onClick={() => onSelect(result)}
                onMouseEnter={() => onActiveIndexChange(idx)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSelect(result);
                }}
                role="button"
                tabIndex={0}
                aria-label={`Select ${result.filename}`}
              >
                <div className="flex items-center gap-2">
                  {/* Filename with highlights */}
                  <span className="font-medium dark:text-white">
                    {renderHighlightedText(result.filename, result.highlights)}
                  </span>

                  {/* Recent indicator */}
                  {result.isRecent && (
                    <span className="text-xs text-blue-500 dark:text-blue-400">
                      Recent
                    </span>
                  )}
                </div>

                {/* Directory path */}
                <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {result.relativePath}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          {results.length > 0 && `${results.length} files`}
        </div>
      </div>
    </div>
  );
}

function renderHighlightedText(text: string, highlights: any[]) {
  if (!highlights || highlights.length === 0) {
    return text;
  }

  const parts: JSX.Element[] = [];
  let lastIndex = 0;

  for (const highlight of highlights) {
    // Text before highlight
    if (highlight.start > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {text.slice(lastIndex, highlight.start)}
        </span>,
      );
    }

    // Highlighted text
    parts.push(
      <span
        key={`highlight-${highlight.start}`}
        className="text-blue-600 dark:text-blue-400 font-semibold"
      >
        {text.slice(highlight.start, highlight.end)}
      </span>,
    );

    lastIndex = highlight.end;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }

  return <>{parts}</>;
}
