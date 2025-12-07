import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Command } from "@/types";
import { searchFiles, type FileSearchResult } from "@/utils/fileSearch";
import path from "path-browserify";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

function focusIfActive(element: HTMLLIElement | null, isActive: boolean) {
  if (isActive && element) {
    element.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }
}

type CommandPaletteProps = {
  isOpen: boolean;
  onClose: () => void;

  commandItems: Command[];

  shellHistory: string[];
  onRunShellCommand: (command: string) => Promise<void> | void;
  onRemoveShellHistoryEntry: (command: string) => Promise<void> | void;

  cwd: string | null;
  onOpenFile?: (filePath: string) => void;
};

export function CommandPalette({
  isOpen,
  onClose,
  commandItems,
  onRunShellCommand,
  shellHistory,
  onRemoveShellHistoryEntry,
  cwd,
  onOpenFile,
}: CommandPaletteProps) {
  const [inputValue, setInputValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fileSearchResults, setFileSearchResults] = useState<
    FileSearchResult[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);

  const previousQueryRef = useRef<string>("");
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setInputValue("");
    setSelectedIndex(0);
    setFileSearchResults([]);
    setIsSearching(false);
    previousQueryRef.current = "";
  }, [isOpen]);

  const firstNonWhitespaceIndex = inputValue.search(/\S/);
  const hasTypedCharacters = firstNonWhitespaceIndex !== -1;
  const isShellMode =
    hasTypedCharacters && inputValue[firstNonWhitespaceIndex] === "!";
  const isFileSearchMode =
    hasTypedCharacters && inputValue[firstNonWhitespaceIndex] === ">";
  const isCreateFileMode =
    hasTypedCharacters && inputValue[firstNonWhitespaceIndex] === ":";
  const shellCommand = isShellMode
    ? inputValue.slice(firstNonWhitespaceIndex + 1)
    : "";
  const fileSearchQuery = isFileSearchMode
    ? inputValue.slice(firstNonWhitespaceIndex + 1).trim()
    : "";
  const createFileName = isCreateFileMode
    ? inputValue.slice(firstNonWhitespaceIndex + 1).trim()
    : "";
  const commandQuery =
    isShellMode || isFileSearchMode || isCreateFileMode
      ? ""
      : inputValue.trim();

  // Debounced file search
  useEffect(() => {
    if (!isFileSearchMode || !cwd || isCreateFileMode) {
      setFileSearchResults([]);
      setIsSearching(false);
      return;
    }

    // Clear any pending search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // If query is empty, clear results
    if (fileSearchQuery.length === 0) {
      setFileSearchResults([]);
      setIsSearching(false);
      return;
    }

    // Start search after debounce delay
    setIsSearching(true);
    console.log(
      `[CommandPalette] Starting file search in cwd: ${cwd}, query: "${fileSearchQuery}"`,
    );
    searchTimeoutRef.current = setTimeout(() => {
      searchFiles(cwd, fileSearchQuery, 50)
        .then((results) => {
          console.log(
            `[CommandPalette] Search completed with ${results.length} results`,
          );
          setFileSearchResults(results);
          setIsSearching(false);
        })
        .catch((error) => {
          console.error("[FileSearch] Search failed:", error);
          setFileSearchResults([]);
          setIsSearching(false);
        });
    }, 100); // 100ms debounce for more dynamic feel

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [isFileSearchMode, fileSearchQuery, cwd, isCreateFileMode]);

  const filteredCommands = useMemo(() => {
    if (isShellMode || isFileSearchMode || isCreateFileMode) {
      return [];
    }

    const query = inputValue.trim().toLowerCase();
    if (query.length === 0) {
      return commandItems;
    }

    return commandItems.filter((command) =>
      command.label.toLowerCase().includes(query),
    );
  }, [
    commandItems,
    inputValue,
    isShellMode,
    isFileSearchMode,
    isCreateFileMode,
  ]);

  const filteredShellHistory = useMemo(() => {
    if (!isShellMode) {
      return [];
    }

    const query = shellCommand.trim().toLowerCase();
    if (query.length === 0) {
      return shellHistory;
    }

    return shellHistory.filter((entry) => entry.toLowerCase().includes(query));
  }, [isShellMode, shellHistory, shellCommand]);

  // Auto-adjust selected index if out of bounds
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const activeLength = isShellMode
      ? filteredShellHistory.length
      : isFileSearchMode
        ? fileSearchResults.length
        : isCreateFileMode
          ? 0
          : filteredCommands.length;

    if (activeLength === 0) {
      setSelectedIndex(0);
      return;
    }

    setSelectedIndex((current) => Math.min(current, activeLength - 1));
  }, [
    filteredCommands.length,
    filteredShellHistory.length,
    fileSearchResults.length,
    isOpen,
    isShellMode,
    isFileSearchMode,
    isCreateFileMode,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (isShellMode) {
      const normalizedShellQuery = shellCommand.trim().toLowerCase();
      if (normalizedShellQuery !== previousQueryRef.current) {
        previousQueryRef.current = normalizedShellQuery;
        setSelectedIndex(0);
      }
      return;
    }

    if (isFileSearchMode) {
      const normalizedFileQuery = fileSearchQuery.toLowerCase();
      if (normalizedFileQuery !== previousQueryRef.current) {
        previousQueryRef.current = normalizedFileQuery;
        setSelectedIndex(0);
      }
      return;
    }

    if (isCreateFileMode) {
      const normalizedCreateFileName = createFileName.toLowerCase();
      if (normalizedCreateFileName !== previousQueryRef.current) {
        previousQueryRef.current = normalizedCreateFileName;
        setSelectedIndex(0);
      }
      return;
    }

    const normalizedQuery = inputValue.trim().toLowerCase();
    if (normalizedQuery !== previousQueryRef.current) {
      previousQueryRef.current = normalizedQuery;
      if (filteredCommands.length > 0) {
        setSelectedIndex(0);
      }
    }
  }, [
    filteredCommands.length,
    filteredShellHistory.length,
    inputValue,
    isOpen,
    isShellMode,
    isFileSearchMode,
    isCreateFileMode,
    shellCommand,
    fileSearchQuery,
    createFileName,
  ]);

  const renderHighlightedLabel = useCallback((label: string, query: string) => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return label;
    }

    const lowerLabel = label.toLowerCase();
    const lowerQuery = trimmedQuery.toLowerCase();
    const matchIndex = lowerLabel.indexOf(lowerQuery);
    if (matchIndex === -1) {
      return label;
    }

    const matchLength = trimmedQuery.length;
    const before = label.slice(0, matchIndex);
    const match = label.slice(matchIndex, matchIndex + matchLength);
    const after = label.slice(matchIndex + matchLength);

    return (
      <>
        {before}
        <span className="text-accent">{match}</span>
        {after}
      </>
    );
  }, []);

  const runCommand = useCallback(
    (command: Command) => {
      void (async () => {
        try {
          await command.run();
        } finally {
          onClose();
        }
      })();
    },
    [onClose],
  );

  const runShell = useCallback(
    (overrideCommand?: string) => {
      const candidate = (overrideCommand ?? shellCommand).trim();
      if (candidate.length === 0) {
        return;
      }

      void (async () => {
        try {
          await onRunShellCommand(candidate);
        } finally {
          onClose();
        }
      })();
    },
    [onClose, onRunShellCommand, shellCommand],
  );

  const openFile = useCallback(
    (filePath: string) => {
      if (onOpenFile) {
        onOpenFile(filePath);
      }
      onClose();
    },
    [onClose, onOpenFile],
  );

  const createFile = useCallback(
    async (fileName: string) => {
      if (!cwd || !fileName || !onOpenFile) {
        return;
      }

      try {
        // Construct full file path
        const filePath = path.join(cwd, fileName);

        // Create the file (empty)
        await window.conduit.writeFile(filePath, "");

        // Open the newly created file
        onOpenFile(filePath);
        onClose();
      } catch (error) {
        console.error("[CommandPalette] Failed to create file:", error);
      }
    },
    [cwd, onOpenFile, onClose],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();

      const key = event.key.toLowerCase();

      if (key === "escape") {
        event.preventDefault();
        if (inputValue.trim().length > 0) {
          setInputValue("");
          setSelectedIndex(0);
          return;
        }
        onClose();
        return;
      }

      if (key === "enter") {
        if (isShellMode) {
          event.preventDefault();
          const manualCommand = shellCommand.trim();
          if (manualCommand.length > 0) {
            runShell(manualCommand);
            return;
          }

          const historyCommand = filteredShellHistory[selectedIndex];
          if (historyCommand) {
            runShell(historyCommand);
          }
          return;
        }

        if (isFileSearchMode) {
          event.preventDefault();
          const selectedFile = fileSearchResults[selectedIndex];
          if (selectedFile) {
            openFile(selectedFile.path);
          }
          return;
        }

        if (isCreateFileMode) {
          event.preventDefault();
          const fileName = createFileName.trim();
          if (fileName.length > 0) {
            void createFile(fileName);
          }
          return;
        }

        const command = filteredCommands[selectedIndex];
        if (command) {
          event.preventDefault();
          runCommand(command);
        }
        return;
      }

      if (key === "arrowdown") {
        event.preventDefault();
        const activeLength = isShellMode
          ? filteredShellHistory.length
          : isFileSearchMode
            ? fileSearchResults.length
            : isCreateFileMode
              ? 0
              : filteredCommands.length;

        if (activeLength === 0) {
          return;
        }

        setSelectedIndex((current) =>
          current >= activeLength - 1 ? 0 : current + 1,
        );
        return;
      }

      if (key === "arrowup") {
        event.preventDefault();
        const activeLength = isShellMode
          ? filteredShellHistory.length
          : isFileSearchMode
            ? fileSearchResults.length
            : isCreateFileMode
              ? 0
              : filteredCommands.length;

        if (activeLength === 0) {
          return;
        }

        setSelectedIndex((current) =>
          current <= 0 ? activeLength - 1 : current - 1,
        );
      }
    },
    [
      filteredShellHistory,
      filteredCommands,
      fileSearchResults,
      inputValue,
      isShellMode,
      isFileSearchMode,
      isCreateFileMode,
      createFileName,
      onClose,
      runCommand,
      runShell,
      openFile,
      createFile,
      selectedIndex,
    ],
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="w-[480px] max-w-[90vw] p-4 gap-0 bg-popover border-white/10 top-[20%] -translate-y-0"
        showClose={false}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Command Palette</DialogTitle>

        <Input
          autoFocus
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Search commands..."
        />

        {/* Help text - show when no prefix is active */}
        {!isShellMode &&
          !isFileSearchMode &&
          !isCreateFileMode &&
          inputValue.trim().length === 0 && (
            <div className="mt-3 px-3 py-2 rounded-md bg-muted/30 border border-border/50 space-y-1.5">
              <div className="text-xs font-semibold text-foreground/80 mb-1.5">
                Quick Actions:
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <kbd className="px-1.5 py-0.5 bg-muted rounded font-mono text-[10px] flex-shrink-0">
                  !
                </kbd>
                <span>Run shell command</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <kbd className="px-1.5 py-0.5 bg-muted rounded font-mono text-[10px] flex-shrink-0">
                  &gt;
                </kbd>
                <span>Search for file</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <kbd className="px-1.5 py-0.5 bg-muted rounded font-mono text-[10px] flex-shrink-0">
                  :
                </kbd>
                <span>Create new file</span>
              </div>
            </div>
          )}

        {isShellMode ? (
          filteredShellHistory.length > 0 ? (
            <ul
              className="mt-3 max-h-64 space-y-2 overflow-y-auto"
              role="listbox"
            >
              {filteredShellHistory.map((historyCommand, index) => {
                const isActive = index === selectedIndex;
                return (
                  <li
                    key={`${historyCommand}-${index}`}
                    ref={(e) => focusIfActive(e, isActive)}
                  >
                    <div
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`flex w-full items-center rounded-md border transition ${
                        isActive
                          ? "border-yellow-500/60 bg-yellow-500/40 text-background"
                          : "border-transparent text-white/80 hover:border-yellow-500/40 hover:bg-yellow-500/15"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => runShell(historyCommand)}
                        className="flex flex-1 flex-col gap-1 px-3 py-2 text-left focus:outline-none"
                      >
                        <span className="text-sm font-medium">
                          {renderHighlightedLabel(historyCommand, shellCommand)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          event.preventDefault();
                          setSelectedIndex((current) => {
                            if (current > index) {
                              return current - 1;
                            }
                            if (current === index) {
                              return Math.max(0, current - 1);
                            }
                            return current;
                          });
                          onRemoveShellHistoryEntry(historyCommand);
                        }}
                        aria-label="Remove command from history"
                        className="mr-2 rounded-md p-1 text-sm leading-none text-current transition hover:bg-black/20 focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
                      >
                        x
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-3 rounded-md border border-dashed border-yellow-500/40 bg-yellow-500/40 px-3 py-2 text-sm text-background">
              {shellHistory.length === 0
                ? "No recent shell commands yet."
                : "No matching recent commands."}
            </div>
          )
        ) : isFileSearchMode ? (
          isSearching ? (
            <div className="mt-3 rounded-md border border-dashed border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-400">
              Searching files...
            </div>
          ) : fileSearchResults.length > 0 ? (
            <ul
              className="mt-3 max-h-64 space-y-2 overflow-y-auto"
              role="listbox"
            >
              {fileSearchResults.map((file, index) => {
                const isActive = index === selectedIndex;
                return (
                  <li
                    key={file.path}
                    ref={(element) => focusIfActive(element, isActive)}
                  >
                    <button
                      type="button"
                      onClick={() => openFile(file.path)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition cursor-pointer ${
                        isActive
                          ? "border-blue-500/60 bg-blue-500/20 text-foreground"
                          : "border-transparent text-white/80 hover:border-blue-500/40 hover:bg-blue-500/10"
                      }`}
                      aria-selected={isActive}
                    >
                      <div className="flex-1 flex flex-col gap-1 min-w-0">
                        <span className="text-sm font-medium truncate">
                          {file.name}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {file.relativePath}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : fileSearchQuery.length > 0 ? (
            <div className="mt-3 rounded-md border border-dashed border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm text-blue-400">
              No files found matching "{fileSearchQuery}"
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-dashed border-blue-500/30 bg-blue-500/5 px-3 py-2 text-sm text-blue-400/70">
              <div className="font-medium mb-1">
                Start typing to search files...
              </div>
              <div className="text-xs text-blue-400/50">
                Searches current directory recursively
              </div>
            </div>
          )
        ) : isCreateFileMode ? (
          createFileName.length > 0 ? (
            <div className="mt-3 rounded-md border border-green-500/40 bg-green-500/10 px-3 py-2">
              <div className="text-sm text-green-400 mb-1">
                <span className="font-medium">Create:</span> {createFileName}
              </div>
              {cwd && <div className="text-xs text-green-400/60">in {cwd}</div>}
              <div className="text-xs text-green-400/50 mt-2">
                Press Enter to create and open
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-dashed border-green-500/30 bg-green-500/5 px-3 py-2 text-sm text-green-400/70">
              <div className="font-medium mb-1">
                Enter a filename to create...
              </div>
              <div className="text-xs text-green-400/50">
                Creates file in current terminal directory
              </div>
            </div>
          )
        ) : filteredCommands.length > 0 ? (
          <ul
            className="mt-3 max-h-64 space-y-2 overflow-y-auto"
            role="listbox"
          >
            {filteredCommands.map((command, index) => {
              const isActive = index === selectedIndex;
              return (
                <li
                  key={command.id}
                  ref={(element) => focusIfActive(element, isActive)}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIndex(index);
                      runCommand(command);
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition cursor-pointer ${
                      isActive
                        ? "border-border bg-muted/30"
                        : "border-transparent hover:border-foreground/20 hover:bg-white/5"
                    }`}
                    aria-selected={isActive}
                  >
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <span className="text-sm tfont-medium">
                        {renderHighlightedLabel(command.label, commandQuery)}
                      </span>
                      {command.description && (
                        <span className="text-xs text-muted-foreground">
                          {command.description}
                        </span>
                      )}
                    </div>
                    {command.keybinding && (
                      <kbd className="ml-3 px-2 py-1 bg-muted rounded font-sans text-xs tracking-wider whitespace-nowrap flex-shrink-0">
                        {command.keybinding}
                      </kbd>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-3 rounded-md border border-dashed border-white/10 bg-white/5 px-3 py-2 text-sm text-white/50">
            No matching commands.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
