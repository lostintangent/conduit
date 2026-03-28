import { clearPressedKeys } from "@/commands/keybindings/parser";
import { cn } from "@/utils";
import type { FileMatch } from "@/utils/quickOpenFiltering";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileText } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Global singleton portal container - shared across all instances
let globalPortalContainer: HTMLDivElement | null = null;
function getGlobalPortalContainer(): HTMLDivElement {
  if (!globalPortalContainer) {
    globalPortalContainer = document.createElement("div");
    globalPortalContainer.id = "quick-open-portal-global";
    document.body.appendChild(globalPortalContainer);
    console.log("[QuickOpen] Created GLOBAL portal container");
  }
  return globalPortalContainer;
}

// Global flag to track which instance is currently rendering
let currentRenderingInstance: string | null = null;

interface QuickOpenOverlayProps {
  visible: boolean;
  query: string;
  results: FileMatch[];
  activeIndex: number;
  isLoading: boolean;
  hasFiles: boolean;
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
  hasFiles,
  onQueryChange,
  onActiveIndexChange,
  onSelect,
  onClose,
}: QuickOpenOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // DEBUG: Log component lifecycle
  const instanceId = useRef(Math.random().toString(36).slice(2, 9));
  console.log(
    `[QuickOpen ${instanceId.current}] RENDER - visible:${visible}, query:"${query}", results:${results.length}`,
  );

  // Claim/release global render flag - only ONE instance should render at a time
  // Priority: instances WITH files can take over from instances WITHOUT files
  useEffect(() => {
    if (visible) {
      const canClaim =
        !currentRenderingInstance || (hasFiles && results.length > 0);

      if (!currentRenderingInstance) {
        // No one has claimed it yet
        currentRenderingInstance = instanceId.current;
        console.log(
          `[QuickOpen ${instanceId.current}] CLAIMED render flag (first)`,
        );
      } else if (currentRenderingInstance !== instanceId.current && canClaim) {
        // Take over if we have files and current owner might not
        console.log(
          `[QuickOpen ${instanceId.current}] TAKING OVER render flag from ${currentRenderingInstance} (has ${hasFiles ? results.length : 0} files)`,
        );
        currentRenderingInstance = instanceId.current;
      } else if (currentRenderingInstance !== instanceId.current) {
        console.log(
          `[QuickOpen ${instanceId.current}] Another instance (${currentRenderingInstance}) owns render flag, will not render`,
        );
      }
    } else {
      // Release flag if we own it
      if (currentRenderingInstance === instanceId.current) {
        currentRenderingInstance = null;
        console.log(`[QuickOpen ${instanceId.current}] RELEASED render flag`);
      }
    }
  }, [visible, hasFiles, results.length]);

  // Virtual scrolling setup
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 24, // Estimated height of each item in pixels
    overscan: 5, // Render 5 extra items above/below viewport
  });

  // Prevent body scroll and layout shift when modal is open
  useEffect(() => {
    if (visible) {
      // Get scrollbar width before hiding overflow
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth;

      // Prevent body scroll and compensate for scrollbar width
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;

      return () => {
        // Restore body scroll
        document.body.style.overflow = "";
        document.body.style.paddingRight = "";
      };
    }
  }, [visible]);

  // Auto-focus input when opened (wait for transition)
  useEffect(() => {
    if (visible && inputRef.current) {
      // Wait for transition to complete before focusing
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  // Reset scroll and force complete virtualizer reset when results change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    // Force virtualizer to recalculate from scratch
    virtualizer.scrollToOffset(0, { behavior: "auto" });
    virtualizer.measure();
  }, [results.length, virtualizer]);

  // Scroll active item into view using virtualizer
  useEffect(() => {
    if (
      results.length > 0 &&
      activeIndex >= 0 &&
      activeIndex < results.length
    ) {
      virtualizer.scrollToIndex(activeIndex, {
        align: "auto",
        behavior: "smooth",
      });
    }
  }, [activeIndex, results.length, virtualizer]);

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          onActiveIndexChange(
            activeIndex < results.length - 1 ? activeIndex + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          onActiveIndexChange(
            activeIndex > 0 ? activeIndex - 1 : results.length - 1,
          );
          break;
        case "Enter":
          e.preventDefault();
          if (results[activeIndex]) {
            onSelect(results[activeIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          clearPressedKeys();
          onClose();
          break;
        case "Tab":
          e.preventDefault();
          if (e.shiftKey) {
            onActiveIndexChange(
              activeIndex > 0 ? activeIndex - 1 : results.length - 1,
            );
          } else {
            onActiveIndexChange(
              activeIndex < results.length - 1 ? activeIndex + 1 : 0,
            );
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, activeIndex, results, onActiveIndexChange, onSelect, onClose]);

  // Only render when visible AND this instance owns the render flag
  if (!visible || currentRenderingInstance !== instanceId.current) {
    return null;
  }

  console.log(
    `[QuickOpen ${instanceId.current}] RENDERING PORTAL with ${results.length} results`,
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className="relative w-full bg-background border border-border rounded-lg shadow-2xl overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-200"
        style={{
          maxWidth: "min(90vw, 800px)",
          maxHeight: "min(70vh, 600px)",
        }}
      >
        {/* Search Input */}
        <div className="border-b border-border p-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search files by name..."
            className="w-full border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm py-1 px-2 h-auto outline-none"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* Results */}
        <div
          ref={scrollContainerRef}
          className="overflow-y-auto"
          style={{ maxHeight: "calc(min(70vh, 600px) - 90px)" }}
        >
          {isLoading && !hasFiles ? (
            <div className="p-4 space-y-2">
              <div className="h-12 bg-muted/50 rounded animate-pulse" />
              <div className="h-12 bg-muted/50 rounded animate-pulse delay-75" />
              <div className="h-12 bg-muted/50 rounded animate-pulse delay-150" />
              <div className="text-center text-muted-foreground text-sm mt-3">
                Loading files...
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              {query ? "No files found" : "Type to search files"}
            </div>
          ) : (
            <div
              key={results.length}
              className="relative py-1 w-full"
              style={{
                height: `${virtualizer.getTotalSize()}px`,
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const file = results[virtualItem.index];
                const index = virtualItem.index;

                // Extract relative directory from relative path
                const relativeDir = file.relativePath.substring(
                  0,
                  file.relativePath.length - file.filename.length - 1,
                );

                return (
                  <div
                    key={`${virtualItem.key}-${file.absolutePath}`}
                    data-index={index}
                    className={cn(
                      "absolute top-0 left-0 w-full px-3 cursor-pointer transition-all duration-150 flex items-center",
                      "hover:bg-accent/50",
                      index === activeIndex && "bg-accent shadow-sm",
                    )}
                    style={{
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    onClick={() => onSelect(file)}
                    onMouseEnter={() => onActiveIndexChange(index)}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 w-full">
                      {/* File icon */}
                      <FileText
                        className="shrink-0 text-foreground"
                        size={12}
                      />
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        {/* Filename with highlights - no wrap */}
                        <span className="text-[13px] whitespace-nowrap shrink-0">
                          {renderHighlightedText(
                            file.filename,
                            file.highlights,
                          )}
                        </span>
                        {/* Relative directory path - truncates */}
                        <span className="text-xs text-muted-foreground truncate min-w-0">
                          {renderHighlightedText(
                            relativeDir || "",
                            file.directoryHighlights,
                          )}
                        </span>
                        {/* Recent badge */}
                        {file.isRecent && (
                          <span className="text-xs bg-accent/50 px-1.5 py-0.5 rounded ml-auto shrink-0">
                            Recent
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer with hints */}
        <div className="border-t border-border px-4 py-3 text-xs leading-normal text-muted-foreground flex items-center justify-between min-h-10">
          <div className="flex items-center gap-2">
            <span>Enter to open</span>
            <span>•</span>
            <span>Esc to close</span>
          </div>
          {results.length > 0 && (
            <span className="tabular-nums">
              {activeIndex + 1} of {results.length}
            </span>
          )}
        </div>
      </div>
    </div>,
    getGlobalPortalContainer(),
  );
}

function renderHighlightedText(text: string, highlights: any[]) {
  if (!highlights || highlights.length === 0) {
    return <span>{text}</span>;
  }

  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  highlights.forEach((match, index) => {
    // Add non-highlighted text before this match
    if (match.start > lastEnd) {
      parts.push(
        <span key={`text-${index}`}>
          {text.substring(lastEnd, match.start)}
        </span>,
      );
    }
    // Add highlighted text
    parts.push(
      <span key={`match-${index}`} className="font-bold text-accent">
        {text.substring(match.start, match.end)}
      </span>,
    );
    lastEnd = match.end;
  });

  // Add remaining text
  if (lastEnd < text.length) {
    parts.push(<span key="text-end">{text.substring(lastEnd)}</span>);
  }

  return <>{parts}</>;
}
