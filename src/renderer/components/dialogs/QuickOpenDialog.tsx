/**
 * QuickOpenDialog - Global dialog for quick file search and navigation
 *
 * Architecture:
 * - Single global instance (NOT per-pane)
 * - Controlled by props (open, onOpenChange)
 * - Uses cwd from active pane
 * - Follows BranchSelector pattern
 *
 * Features:
 * - Fuzzy file search using ripgrep backend
 * - Recent files priority
 * - Virtual scrolling for performance
 * - Keyboard navigation (up/down/enter/escape)
 *
 * @example
 * ```tsx
 * <QuickOpenDialog
 *   open={isOpen}
 *   cwd={activePaneCwd}
 *   onOpenChange={setIsOpen}
 *   onSelectFile={handleFileOpen}
 * />
 * ```
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { QuickOpenAPI } from "@/api/QuickOpenAPI";
import { filterFiles, type FileMatch } from "@/utils/quickOpenFiltering";
import { useQuickOpenRecentFiles } from "@/hooks/useQuickOpenRecentFiles";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/utils";

export interface QuickOpenDialogProps {
  /** Whether the dialog is open */
  open: boolean;

  /** Current working directory to search in */
  cwd: string;

  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;

  /** Callback when a file is selected */
  onSelectFile: (absolutePath: string) => void;
}

/**
 * Global dialog for quick file opening via fuzzy search
 */
export function QuickOpenDialog({
  open,
  cwd,
  onOpenChange,
  onSelectFile,
}: QuickOpenDialogProps) {
  // ---------------------------------------------------------------------------
  // DEBUG: Track renders
  // ---------------------------------------------------------------------------
  const renderCount = useRef(0);
  renderCount.current++;
  console.log(`[QuickOpenDialog] Render #${renderCount.current}`, {
    open,
    cwd,
  });

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileMatch[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fileList, setFileList] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<QuickOpenAPI | null>(null);

  // Recent files tracking
  const recentFiles = useQuickOpenRecentFiles();

  // ---------------------------------------------------------------------------
  // Load file cache when dialog opens or cwd changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    console.log("[QuickOpenDialog] Effect: Load file cache - triggered", {
      open,
      cwd,
    });
    if (!open) return;

    // Don't scan unsafe/broad directories
    const isSafeDirectory =
      cwd &&
      !cwd.match(/^(\/|\/Users\/[^\/]+|\/home\/[^\/]+|C:\\Users\\[^\\]+)$/);

    if (!isSafeDirectory) {
      console.log(
        `[QuickOpenDialog] Skipping cache for unsafe/broad directory: ${cwd}`,
      );
      setIsLoading(false);
      setFileList([]);
      return;
    }

    // Initialize API for this cwd
    const api = new QuickOpenAPI(cwd);
    apiRef.current = api;

    // Load pre-warmed cache
    setIsLoading(true);
    api
      .getPreWarmedCache()
      .then((files) => {
        if (files.length === 0) {
          // No cache found, warm it now
          console.log("[QuickOpenDialog] No cache found, warming now...");
          return api.warmCache().then(() => api.getPreWarmedCache());
        }
        return files;
      })
      .then((files) => {
        console.log(
          `[QuickOpenDialog] Loaded ${files.length} files from cache`,
        );
        setFileList(files);
      })
      .catch((error) => {
        console.error("[QuickOpenDialog] Failed to load cache:", error);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [open, cwd]);

  // ---------------------------------------------------------------------------
  // Filter files when query or file list changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    console.log("[QuickOpenDialog] Effect: Filter files - triggered", {
      open,
      query,
      fileListLength: fileList.length,
      recentFilesLength: recentFiles.recentFiles.length,
    });
    if (!open) return;

    const timeoutId = setTimeout(() => {
      // If no files yet, show only recent files
      const filesToFilter =
        fileList.length > 0 ? fileList : recentFiles.recentFiles;

      const filtered = filterFiles(query, filesToFilter, {
        recentFiles: new Set(recentFiles.recentFiles),
        workspaceRoot: cwd,
        maxResults: 1000,
      });

      setResults(filtered);
      setActiveIndex(0);
    }, 50); // 50ms debounce

    return () => clearTimeout(timeoutId);
  }, [query, fileList, open, recentFiles.recentFiles, cwd]);

  // ---------------------------------------------------------------------------
  // Virtual scrolling setup
  // ---------------------------------------------------------------------------

  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 24, // Row height in pixels
    overscan: 5,
  });

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Focus input when dialog opens
  useEffect(() => {
    console.log("[QuickOpenDialog] open prop changed:", open);
    if (open) {
      console.log("[QuickOpenDialog] Dialog opening - will focus input");
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      console.log("[QuickOpenDialog] Dialog closing - resetting state");
      // Reset state when dialog closes
      setQuery("");
      setActiveIndex(0);
      setResults([]);
    }
  }, [open]);

  // Reset scroll when results change
  useEffect(() => {
    console.log("[QuickOpenDialog] Effect: Reset scroll - triggered", {
      resultsLength: results.length,
    });
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    virtualizer.scrollToOffset(0, { behavior: "auto" });
  }, [results.length, virtualizer]);

  // Scroll active item into view
  useEffect(() => {
    console.log("[QuickOpenDialog] Effect: Scroll active item - triggered", {
      activeIndex,
      resultsLength: results.length,
    });
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

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSelect = useCallback(
    (file: FileMatch) => {
      recentFiles.addRecentFile(file.absolutePath);
      onSelectFile(file.absolutePath);
      onOpenChange(false);
    },
    [recentFiles, onSelectFile, onOpenChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        console.log(
          "[QuickOpenDialog] Escape pressed - calling onOpenChange(false)",
        );
        onOpenChange(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
      } else if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        } else {
          setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (results[activeIndex]) {
          handleSelect(results[activeIndex]);
        }
      }
    },
    [results, activeIndex, onOpenChange, handleSelect],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const hasFiles = fileList.length > 0;

  // Determine render state
  // State 1: Loading initial files or waiting for results to populate after files loaded
  const showSkeleton =
    isLoading || (hasFiles && results.length === 0 && query === "");

  // State 2: User searched but no matches
  const showNoMatches = hasFiles && results.length === 0 && query !== "";

  // State 3: Workspace has no files (genuine empty state)
  const showEmptyState = !hasFiles && !isLoading;

  // State 4: Have results to show
  const showResults = results.length > 0;

  // DEBUG: Log state at render time
  console.log("[QuickOpenDialog] Render state:", {
    isLoading,
    hasFiles,
    resultsLength: results.length,
    query,
    fileListLength: fileList.length,
    showSkeleton,
    showNoMatches,
    showEmptyState,
    showResults,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[min(90vw,800px)] max-h-[min(70vh,600px)] p-0 flex flex-col gap-0"
        onKeyDown={handleKeyDown}
        data-testid="quick-open-dialog"
      >
        {/* Accessible title (hidden) */}
        <DialogTitle className="sr-only">Quick Open</DialogTitle>
        <DialogDescription className="sr-only">
          Search for files by name
        </DialogDescription>

        {/* Search Input */}
        <div className="border-b border-border p-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files by name..."
            className="w-full border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm py-1 px-2 h-auto outline-none"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* Results */}
        <div
          ref={scrollContainerRef}
          className="overflow-y-auto flex-1"
          style={{
            maxHeight: "calc(min(70vh, 600px) - 90px)",
            minHeight: "calc(min(70vh, 600px) - 90px)", // Optimistic: assume max height
          }}
        >
          {showSkeleton ? (
            // State 1: Show skeleton while loading or waiting for initial filter
            <div className="py-1 space-y-0">
              {Array.from({ length: 15 }).map((_, i) => (
                <div
                  key={i}
                  className="h-6 px-3 flex items-center gap-1.5 opacity-50"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div className="w-3 h-3 bg-muted rounded animate-pulse" />
                  <div className="flex-1 flex items-center gap-2">
                    <div className="w-32 h-3 bg-muted rounded animate-pulse" />
                    <div className="w-48 h-2 bg-muted/50 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : showNoMatches ? (
            // State 2: User searched but no matches
            <div className="p-4 text-center text-muted-foreground">
              No files found
            </div>
          ) : showEmptyState ? (
            // State 3: Workspace genuinely has no files
            <div className="p-4 text-center text-muted-foreground">
              No files in workspace
            </div>
          ) : showResults ? (
            // State 4: Show results
            <div
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
                    onClick={() => handleSelect(file)}
                    onMouseEnter={() => setActiveIndex(index)}
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
                          {relativeDir || ""}
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
          ) : null}
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
      </DialogContent>
    </Dialog>
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
      <span key={`match-${index}`} className="font-bold">
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
