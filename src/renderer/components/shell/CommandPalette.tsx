import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Command } from "@/types";
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
};

export function CommandPalette({
  isOpen,
  onClose,
  commandItems,
  onRunShellCommand,
  shellHistory,
  onRemoveShellHistoryEntry,
}: CommandPaletteProps) {
  const [inputValue, setInputValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const previousQueryRef = useRef<string>("");

  useEffect(() => {
    if (!isOpen) return;

    setInputValue("");
    setSelectedIndex(0);
    previousQueryRef.current = "";
  }, [isOpen]);

  const firstNonWhitespaceIndex = inputValue.search(/\S/);
  const hasTypedCharacters = firstNonWhitespaceIndex !== -1;
  const isShellMode =
    hasTypedCharacters && inputValue[firstNonWhitespaceIndex] === "!";
  const shellCommand = isShellMode
    ? inputValue.slice(firstNonWhitespaceIndex + 1)
    : "";
  const commandQuery = isShellMode ? "" : inputValue.trim();

  const filteredCommands = useMemo(() => {
    if (isShellMode) {
      return [];
    }

    const query = inputValue.trim().toLowerCase();
    if (query.length === 0) {
      return commandItems;
    }

    return commandItems.filter((command) =>
      command.label.toLowerCase().includes(query),
    );
  }, [commandItems, inputValue, isShellMode]);

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
      : filteredCommands.length;

    if (activeLength === 0) {
      setSelectedIndex(0);
      return;
    }

    setSelectedIndex((current) => Math.min(current, activeLength - 1));
  }, [
    filteredCommands.length,
    filteredShellHistory.length,
    isOpen,
    isShellMode,
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
    shellCommand,
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
        <span className="text-sky-400">{match}</span>
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
      inputValue,
      isShellMode,
      onClose,
      runCommand,
      runShell,
      selectedIndex,
    ],
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="w-[480px] max-w-[90vw] p-4 gap-0 bg-surface-elevated border-white/10"
        showClose={false}
      >
        <input
          autoFocus
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Search commands or type ! to run a shell command..."
          className="w-full rounded-md border border-white/10 bg-input px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/30"
        />

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
                          ? "border-yellow-500/60 bg-yellow-500/40 text-foreground-inverse"
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
                          void onRemoveShellHistoryEntry(historyCommand);
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
            <div className="mt-3 rounded-md border border-dashed border-yellow-500/40 bg-yellow-500/40 px-3 py-2 text-sm text-foreground-inverse">
              {shellHistory.length === 0
                ? "No recent shell commands yet."
                : "No matching recent commands."}
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
                        ? "border-white/30 bg-white/10 text-white"
                        : "border-transparent text-white/80 hover:border-white/20 hover:bg-white/5"
                    }`}
                    aria-selected={isActive}
                  >
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <span className="text-sm font-medium">
                        {renderHighlightedLabel(command.label, commandQuery)}
                      </span>
                      {command.description && (
                        <span className="text-xs text-white/50">
                          {command.description}
                        </span>
                      )}
                    </div>
                    {command.keybinding && (
                      <kbd className="ml-3 px-2 py-1 bg-white/10 rounded border border-white/10 font-sans text-xs text-white/60 tracking-wider whitespace-nowrap flex-shrink-0">
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
