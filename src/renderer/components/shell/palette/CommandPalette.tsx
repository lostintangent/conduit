/**
 * CommandPalette - Unified palette for files and commands
 *
 * Architecture:
 * - Single global instance (NOT per-pane)
 * - Controlled by props (open, onOpenChange)
 * - Two modes: file mode (default) and command mode (when query starts with ">")
 *
 * Features:
 * - Fuzzy search with match highlighting (VS Code algorithm)
 * - Virtual scrolling for performance
 * - Keyboard navigation (arrows/tab/enter/escape)
 * - Recent files tracking (file mode)
 *
 * @example
 * ```tsx
 * // File mode (default)
 * <CommandPalette open={isOpen} cwd={cwd} onOpenChange={setIsOpen} ... />
 *
 * // Command mode (open with ">" prefix)
 * <CommandPalette open={isOpen} initialValue=">" commands={commands} ... />
 * ```
 */

import { QuickOpenAPI } from "@features/files/client/QuickOpenAPI";
import { clearPressedKeys } from "@/commands/keybindings/parser";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuickOpenRecentFiles } from "@/hooks/useQuickOpenRecentFiles";
import type { Command } from "@/types";
import { cn } from "@/utils";
import { filterCommands, type CommandMatch } from "@/utils/commandFiltering";
import type { IMatch } from "@/utils/fuzzy-matcher";
import { filterFiles, type FileMatch } from "@/utils/quickOpenFiltering";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileText, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface CommandPaletteProps {
  /** Whether the dialog is open */
  open: boolean;

  /** Current working directory to search in */
  cwd: string;

  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;

  /** Callback when a file is selected */
  onSelectFile: (absolutePath: string) => void;

  /** Initial input value (e.g., ">" for command mode) */
  initialValue?: string;

  /** Commands to show when in command mode (input starts with ">") */
  commands?: Command[];
}

/**
 * Global dialog for quick file opening via fuzzy search
 */
export function CommandPalette({
  open,
  cwd,
  onOpenChange,
  onSelectFile,
  initialValue = "",
  commands = [],
}: CommandPaletteProps) {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [query, setQuery] = useState(open ? initialValue : "");
  // Starts the query over each time it opens, and when it's opened again with
  // a different initialValue (Cmd+Shift+P over quick open). Done while
  // rendering, so the input already has it when it takes focus.
  const openedWith = open ? initialValue : null;
  const [queryStartedFrom, setQueryStartedFrom] = useState(openedWith);
  if (openedWith !== queryStartedFrom) {
    setQueryStartedFrom(openedWith);
    setQuery(openedWith ?? "");
  }
  const [fileResults, setFileResults] = useState<FileMatch[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [fileList, setFileList] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMouseMoved, setHasMouseMoved] = useState(false);
  const [hoverDelayPassed, setHoverDelayPassed] = useState(false);

  // ---------------------------------------------------------------------------
  // Mode Detection
  // ---------------------------------------------------------------------------

  const isCommandMode = query.startsWith(">");
  const effectiveQuery = isCommandMode ? query.slice(1) : query;

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<QuickOpenAPI | null>(null);
  const initialMousePositionRef = useRef({ x: 0, y: 0 });

  // Recent files tracking
  const recentFiles = useQuickOpenRecentFiles();

  // ---------------------------------------------------------------------------
  // Load file cache when dialog opens or cwd changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!open) return;

    // Don't scan unsafe/broad directories
    const isSafeDirectory =
      cwd &&
      !cwd.match(/^(\/|\/Users\/[^/]+|\/home\/[^/]+|C:\\Users\\[^\\]+)$/);

    if (!isSafeDirectory) {
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
          return api.warmCache().then(() => api.getPreWarmedCache());
        }
        return files;
      })
      .then((files) => {
        setFileList(files);
      })
      .catch((error) => {
        console.error("[CommandPalette] Failed to load cache:", error);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [open, cwd]);

  // ---------------------------------------------------------------------------
  // Filter files when query or file list changes (file mode only)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!open || isCommandMode) return;

    const timeoutId = setTimeout(() => {
      // If no files yet, show only recent files
      const filesToFilter =
        fileList.length > 0 ? fileList : recentFiles.recentFiles;

      const filtered = filterFiles(effectiveQuery, filesToFilter, {
        recentFiles: new Set(recentFiles.recentFiles),
        workspaceRoot: cwd,
        maxResults: 1000,
      });

      setFileResults(filtered);
      setActiveIndex(0);
    }, 50); // 50ms debounce

    return () => clearTimeout(timeoutId);
  }, [
    effectiveQuery,
    fileList,
    open,
    recentFiles.recentFiles,
    cwd,
    isCommandMode,
  ]);

  // ---------------------------------------------------------------------------
  // Filter commands when query or commands change (command mode only)
  // Uses useMemo instead of useEffect to ensure synchronous updates with latest data
  // ---------------------------------------------------------------------------

  const commandResults = useMemo(() => {
    if (!open || !isCommandMode) return [];
    return filterCommands(effectiveQuery, commands);
  }, [open, isCommandMode, effectiveQuery, commands]);

  // Reset active index when command results change
  useEffect(() => {
    if (isCommandMode) {
      setActiveIndex(0);
    }
  }, [commandResults, isCommandMode]);

  // ---------------------------------------------------------------------------
  // Active Results (based on mode)
  // ---------------------------------------------------------------------------

  const activeResultsCount = isCommandMode
    ? commandResults.length
    : fileResults.length;

  // ---------------------------------------------------------------------------
  // Virtual scrolling setup
  // ---------------------------------------------------------------------------

  // Row height: 48px for commands (2 lines), 24px for files (1 line)
  const rowHeight = isCommandMode ? 48 : 24;

  const virtualizer = useVirtualizer({
    count: activeResultsCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => rowHeight,
    overscan: 5,
  });

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setActiveIndex(0);
      setHoveredIndex(null);
      setHasMouseMoved(false);
      setHoverDelayPassed(false);
      setFileResults([]);
    }
  }, [open]);

  // Track mouse movement to prevent hover flash on dialog open
  // Hybrid approach: enable hover after EITHER mouse movement OR 150ms delay
  useEffect(() => {
    if (!open) return;

    // Reset states and capture initial position
    setHasMouseMoved(false);
    setHoverDelayPassed(false);
    initialMousePositionRef.current = {
      x: window.event ? (window.event as MouseEvent).clientX : 0,
      y: window.event ? (window.event as MouseEvent).clientY : 0,
    };

    // Timer: enable hover after 150ms even if mouse hasn't moved
    const timer = setTimeout(() => {
      setHoverDelayPassed(true);
    }, 150);

    const handleMouseMove = (e: MouseEvent) => {
      // Enable hover immediately if mouse has moved at least 5px from initial position
      const deltaX = Math.abs(e.clientX - initialMousePositionRef.current.x);
      const deltaY = Math.abs(e.clientY - initialMousePositionRef.current.y);

      if (deltaX > 5 || deltaY > 5) {
        setHasMouseMoved(true);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [open]);

  // Reset scroll when results change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    virtualizer.scrollToOffset(0, { behavior: "auto" });
  }, [activeResultsCount, virtualizer]);

  // Scroll active item into view
  useEffect(() => {
    if (
      activeResultsCount > 0 &&
      activeIndex >= 0 &&
      activeIndex < activeResultsCount
    ) {
      virtualizer.scrollToIndex(activeIndex, {
        align: "auto",
        behavior: "smooth",
      });
    }
  }, [activeIndex, activeResultsCount, virtualizer]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleFileSelect = useCallback(
    (file: FileMatch) => {
      recentFiles.addRecentFile(file.absolutePath);
      onSelectFile(file.absolutePath);
      onOpenChange(false);
    },
    [recentFiles, onSelectFile, onOpenChange],
  );

  const handleCommandSelect = useCallback(
    (command: CommandMatch) => {
      onOpenChange(false);
      // Run command after dialog closes
      command.run();
    },
    [onOpenChange],
  );

  const handleRemoveRecent = useCallback(
    (e: React.MouseEvent, filePath: string) => {
      e.stopPropagation(); // Prevent file selection
      recentFiles.removeRecentFile(filePath);
    },
    [recentFiles],
  );

  // Radix would select the input's ">", so typing replaced it. The caret goes
  // after it instead, before a key can land.
  const handleOpenAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    const input = inputRef.current;
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        clearPressedKeys();
        onOpenChange(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < activeResultsCount - 1 ? prev + 1 : 0,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : activeResultsCount - 1,
        );
      } else if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : activeResultsCount - 1,
          );
        } else {
          setActiveIndex((prev) =>
            prev < activeResultsCount - 1 ? prev + 1 : 0,
          );
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (isCommandMode) {
          const command = commandResults[activeIndex];
          if (command) {
            handleCommandSelect(command);
          }
        } else {
          const file = fileResults[activeIndex];
          if (file) {
            handleFileSelect(file);
          }
        }
      }
    },
    [
      activeResultsCount,
      activeIndex,
      onOpenChange,
      isCommandMode,
      commandResults,
      fileResults,
      handleFileSelect,
      handleCommandSelect,
    ],
  );

  // ---------------------------------------------------------------------------
  // Render State (derived, not stored)
  // ---------------------------------------------------------------------------

  const renderState = useMemo(() => {
    const hasFiles = fileList.length > 0;

    if (isCommandMode) {
      // Command mode render states
      if (commands.length === 0) {
        return { type: "empty" as const, message: "No commands available" };
      }
      if (commandResults.length === 0 && effectiveQuery.length > 0) {
        return { type: "no-matches" as const, message: "No matching commands" };
      }
      if (commandResults.length > 0) {
        return { type: "results" as const };
      }
      // Waiting for filter to run (brief moment after typing ">")
      return { type: "results" as const };
    } else {
      // File mode render states
      if (
        isLoading ||
        (hasFiles && fileResults.length === 0 && effectiveQuery === "")
      ) {
        return { type: "skeleton" as const };
      }
      if (hasFiles && fileResults.length === 0 && effectiveQuery !== "") {
        return { type: "no-matches" as const, message: "No files found" };
      }
      if (!hasFiles && !isLoading) {
        return { type: "empty" as const, message: "No files in workspace" };
      }
      if (fileResults.length > 0) {
        return { type: "results" as const };
      }
      return { type: "skeleton" as const };
    }
  }, [
    isCommandMode,
    commands.length,
    commandResults.length,
    effectiveQuery,
    fileList.length,
    isLoading,
    fileResults.length,
  ]);

  // Find the index where recent files end (for divider placement) - file mode only
  const lastRecentIndex = useMemo(() => {
    if (isCommandMode) return -1;
    return fileResults.findIndex((file, index) => {
      if (index === 0) return false;
      return !file.isRecent && fileResults[index - 1].isRecent;
    });
  }, [fileResults, isCommandMode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[min(90vw,800px)] max-h-[min(70vh,600px)] p-0 flex flex-col gap-0 [&>button]:top-2.5"
        onOpenAutoFocus={handleOpenAutoFocus}
        onKeyDown={handleKeyDown}
        data-testid="command-palette"
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
            placeholder={
              isCommandMode
                ? "Type to search commands..."
                : "Search files by name (type > for commands)..."
            }
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
            maxHeight: "calc(min(70vh, 600px) - 45px)",
            minHeight: "calc(min(70vh, 600px) - 45px)",
          }}
        >
          {renderState.type === "skeleton" ? (
            <SkeletonRows />
          ) : renderState.type === "no-matches" ||
            renderState.type === "empty" ? (
            <div className="p-4 text-center text-muted-foreground">
              {renderState.message}
            </div>
          ) : renderState.type === "results" ? (
            // State 4: Show results
            <div
              className="relative py-1 w-full"
              style={{
                height: `${virtualizer.getTotalSize()}px`,
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const index = virtualItem.index;

                if (isCommandMode) {
                  // Render command item (2 lines: label + keybinding, then description)
                  const command = commandResults[index];
                  return (
                    <div
                      key={`${virtualItem.key}-${command.id}`}
                      data-index={index}
                      className={cn(
                        "absolute top-0 left-0 w-full px-3 py-1.5 cursor-pointer transition-all duration-150 flex flex-col justify-center",
                        "hover:bg-accent/50",
                        index === activeIndex && "bg-accent shadow-sm",
                      )}
                      style={{
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                      onClick={() => handleCommandSelect(command)}
                      onMouseEnter={() => {
                        if (!hasMouseMoved && !hoverDelayPassed) return;
                        setActiveIndex(index);
                        setHoveredIndex(index);
                      }}
                      onMouseLeave={() => setHoveredIndex(null)}
                    >
                      {/* First line: label + keybinding */}
                      <div className="flex items-center gap-1.5 min-w-0 w-full">
                        <span className="text-[13px] whitespace-nowrap flex-1 min-w-0 truncate">
                          {renderHighlightedText(
                            command.label,
                            command.labelHighlights,
                            index === activeIndex,
                          )}
                        </span>
                        {command.keybinding && (
                          <kbd className="shrink-0 px-2 py-0.5 bg-muted rounded text-xs font-sans tracking-wider text-muted-foreground">
                            {command.keybinding}
                          </kbd>
                        )}
                      </div>
                      {/* Second line: description */}
                      {(command.description || command.category) && (
                        <div className="flex items-center min-w-0 w-full">
                          <span className="text-xs text-muted-foreground truncate min-w-0">
                            {renderHighlightedText(
                              command.description || command.category || "",
                              command.descriptionHighlights,
                              index === activeIndex,
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                } else {
                  // Render file item
                  const file = fileResults[index];

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
                      onClick={() => handleFileSelect(file)}
                      onMouseEnter={() => {
                        // Only respond to hover after EITHER mouse movement OR delay
                        if (!hasMouseMoved && !hoverDelayPassed) return;
                        setActiveIndex(index);
                        setHoveredIndex(index);
                      }}
                      onMouseLeave={() => setHoveredIndex(null)}
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
                              index === activeIndex,
                            )}
                          </span>
                          {/* Relative directory path - truncates */}
                          <span className="text-xs text-muted-foreground truncate min-w-0">
                            {renderHighlightedText(
                              relativeDir || "",
                              file.directoryHighlights,
                              index === activeIndex,
                            )}
                          </span>
                          {/* Recent badge - only on first recent item */}
                          {file.isRecent && index === 0 && (
                            <span className="text-xs bg-accent/50 px-1.5 py-0.5 rounded ml-auto shrink-0">
                              Recent
                            </span>
                          )}
                        </div>

                        {/* Delete button - only for recent files on hover */}
                        {file.isRecent && hoveredIndex === index && (
                          <button
                            onClick={(e) =>
                              handleRemoveRecent(e, file.absolutePath)
                            }
                            className="ml-auto shrink-0 p-0.5 rounded hover:bg-accent transition-colors"
                            aria-label="Remove from recent files"
                          >
                            <X className="h-3 w-3 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }
              })}

              {/* Divider between recent and other files (file mode only) */}
              {lastRecentIndex > 0 && (
                <div
                  className="absolute left-0 w-full px-3 pointer-events-none"
                  style={{
                    height: "1px",
                    transform: `translateY(${lastRecentIndex * rowHeight - 4}px)`,
                  }}
                >
                  <div className="w-full h-px bg-border" />
                </div>
              )}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

/** Skeleton loading state for file list */
function SkeletonRows() {
  return (
    <div className="py-1 space-y-0">
      {Array.from({ length: 15 }).map((_, i) => (
        <div
          key={`skeleton-${i}`}
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
  );
}

/** Renders text with fuzzy match highlights */
function renderHighlightedText(
  text: string,
  highlights: IMatch[],
  isActive: boolean = false,
): React.ReactNode {
  if (!highlights || highlights.length === 0) {
    return <span>{text}</span>;
  }

  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  const highlightClass = isActive
    ? "font-bold text-accent-foreground"
    : "font-bold text-accent";

  highlights.forEach((match, i) => {
    // Add non-highlighted text before this match
    if (match.start > lastEnd) {
      parts.push(
        <span key={`text-${i}`}>{text.substring(lastEnd, match.start)}</span>,
      );
    }
    // Add highlighted text
    parts.push(
      <span key={`match-${i}`} className={highlightClass}>
        {text.substring(match.start, match.end)}
      </span>,
    );
    lastEnd = match.end;
  });

  // Add remaining text after last match
  if (lastEnd < text.length) {
    parts.push(<span key="text-end">{text.substring(lastEnd)}</span>);
  }

  return <>{parts}</>;
}
