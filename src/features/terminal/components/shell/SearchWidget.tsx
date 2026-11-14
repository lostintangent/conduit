import { clearPressedKeys } from "@/commands/keybindings/parser";
import { resolveColor } from "@/utils/theme";
import type { ISearchOptions } from "@xterm/addon-search";
import {
  ArrowDown,
  ArrowUp,
  CaseSensitive,
  Regex,
  WholeWord,
  X,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { xtermInstance } from "../../client/xtermCache";

const buildSearchDecorations = (): NonNullable<
  ISearchOptions["decorations"]
> => ({
  matchBackground: resolveColor("selection"),
  matchOverviewRuler: resolveColor("selection"),
  activeMatchBackground: resolveColor("accent"),
  activeMatchColorOverviewRuler: resolveColor("accent"),
});

export type SearchWidgetHandle = {
  show: (selection: string) => void;
};

type SearchWidgetProps = {
  terminal: xtermInstance | null;
  onClosed?: () => void;
  ref?: React.Ref<SearchWidgetHandle>;
};

type SearchResults = {
  index: number;
  count: number;
};

export function SearchWidget({ terminal, onClosed, ref }: SearchWidgetProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [isVisible, setIsVisible] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [matchWholeWord, setMatchWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  const [searchResults, setSearchResults] = useState<SearchResults>({
    index: -1,
    count: 0,
  });

  const searchAddon = terminal?.search ?? null;
  const xterm = terminal?.terminal ?? null;
  const hasSearchTerm = searchTerm.trim().length > 0;
  const searchDecorations = useMemo(() => buildSearchDecorations(), []);

  const buildSearchOptions = useCallback(
    (
      overrides?: Partial<ISearchOptions>,
      flags?: {
        caseSensitive?: boolean;
        wholeWord?: boolean;
        regex?: boolean;
      },
    ): ISearchOptions => {
      const options: ISearchOptions = {
        caseSensitive: flags?.caseSensitive ?? matchCase,
        wholeWord: flags?.wholeWord ?? matchWholeWord,
        regex: flags?.regex ?? useRegex,
        ...(overrides ?? {}),
      };

      options.decorations = searchDecorations;
      return options;
    },
    [matchCase, matchWholeWord, searchDecorations, useRegex],
  );

  const clearSearchArtifacts = useCallback(() => {
    searchAddon?.clearActiveDecoration();
    searchAddon?.clearDecorations();
    setSearchResults({ index: -1, count: 0 });
  }, [searchAddon]);

  const runSearch = useCallback(
    (direction: "next" | "previous") => {
      const trimmed = searchTerm.trim();
      if (!searchAddon || !trimmed) {
        return;
      }

      if (direction === "next") {
        searchAddon.findNext(trimmed, buildSearchOptions());
      } else {
        searchAddon.findPrevious(trimmed, buildSearchOptions());
      }
    },
    [buildSearchOptions, searchAddon, searchTerm],
  );

  const applySearchFlags = useCallback(
    (nextCase: boolean, nextWholeWord: boolean, nextRegex: boolean) => {
      const trimmed = searchTerm.trim();
      if (!searchAddon || !trimmed) {
        if (!trimmed) {
          clearSearchArtifacts();
        }
        return;
      }

      setSearchResults({ index: -1, count: -1 });
      searchAddon.findNext(
        trimmed,
        buildSearchOptions(
          { incremental: true },
          {
            caseSensitive: nextCase,
            wholeWord: nextWholeWord,
            regex: nextRegex,
          },
        ),
      );
    },
    [buildSearchOptions, clearSearchArtifacts, searchAddon, searchTerm],
  );

  const toggleMatchCase = () => {
    const next = !matchCase;
    setMatchCase(next);
    applySearchFlags(next, matchWholeWord, useRegex);
  };

  const toggleMatchWholeWord = () => {
    const next = !matchWholeWord;
    setMatchWholeWord(next);
    applySearchFlags(matchCase, next, useRegex);
  };

  const toggleUseRegex = () => {
    const next = !useRegex;
    setUseRegex(next);
    applySearchFlags(matchCase, matchWholeWord, next);
  };

  const updateSearchTerm = useCallback(
    (value: string) => {
      setSearchTerm(value);
      if (!searchAddon) {
        return;
      }

      const trimmed = value.trim();
      if (!trimmed) {
        clearSearchArtifacts();
        xterm?.clearSelection();
        return;
      }

      setSearchResults({ index: -1, count: -1 });
      searchAddon.findNext(
        trimmed,
        buildSearchOptions({
          incremental: true,
        }),
      );
    },
    [buildSearchOptions, clearSearchArtifacts, searchAddon, xterm],
  );

  const show = useCallback(
    (selection: string) => {
      const trimmed = selection.trim();
      setIsVisible(true);
      requestAnimationFrame(() => inputRef.current?.focus());

      if (!trimmed) {
        setSearchTerm("");
        clearSearchArtifacts();
        return;
      }

      setSearchTerm(trimmed);
      setSearchResults({ index: -1, count: -1 });

      requestAnimationFrame(() => {
        if (!searchAddon) {
          setSearchResults({ index: -1, count: 0 });
          return;
        }
        searchAddon.findNext(
          trimmed,
          buildSearchOptions({ incremental: true }),
        );
      });
    },
    [buildSearchOptions, clearSearchArtifacts, searchAddon],
  );

  const handleSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch(event.shiftKey ? "previous" : "next");
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (searchTerm.trim().length > 0) {
        updateSearchTerm("");
        requestAnimationFrame(() => inputRef.current?.focus());
      } else {
        handleClose();
      }
    }
  };

  const handleClose = () => {
    setIsVisible(false);
    xterm?.clearSelection();
    setSearchTerm("");
    clearSearchArtifacts();
    // Clear any stale pressed keys to ensure global keybindings work after closing
    clearPressedKeys();
    onClosed();
  };

  useEffect(() => {
    if (!searchAddon) {
      return;
    }

    const disposable = searchAddon.onDidChangeResults(
      ({ resultIndex, resultCount }) => {
        setSearchResults({ index: resultIndex, count: resultCount });
      },
    );

    return () => disposable.dispose();
  }, [searchAddon]);

  useImperativeHandle(
    ref,
    () => ({
      show,
    }),
    [show],
  );

  const searchStatusLabel = useMemo(() => {
    if (searchResults.count <= 0) {
      return "No results";
    }

    return searchResults.index >= 0
      ? `${searchResults.index + 1} of ${searchResults.count}`
      : `${searchResults.count} results`;
  }, [searchResults.count, searchResults.index]);

  const searchStatusClass = useMemo(() => {
    if (searchResults.count < 0) {
      return "text-white";
    }
    if (hasSearchTerm && searchResults.count === 0) {
      return "text-red-400";
    }
    return "text-white";
  }, [hasSearchTerm, searchResults.count]);

  const searchNavigationDisabled =
    !hasSearchTerm || searchResults.count <= 0 || !searchAddon;

  return (
    <div
      className={`absolute top-2 right-7 z-30 flex items-center gap-2 rounded-lg border border-white/10 bg-black/80 px-3 py-2 shadow-lg transition-all duration-200 ease-out ${
        isVisible
          ? "translate-y-0 opacity-100"
          : "-translate-y-3 opacity-0 pointer-events-none"
      }`}
      onMouseDown={(e) => e.stopPropagation()}
      aria-hidden={!isVisible}
    >
      <div className="relative">
        <input
          ref={inputRef}
          value={searchTerm}
          onChange={(event) => updateSearchTerm(event.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Find..."
          className="w-60 rounded border border-white/20 bg-transparent px-2 py-1.5 pr-24 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
        />
        <div className="pointer-events-auto absolute right-1 top-1 flex items-center gap-1">
          <button
            type="button"
            onClick={toggleMatchCase}
            className={`cursor-pointer rounded-sm p-1 text-white/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
              matchCase
                ? "bg-blue-500 text-white hover:bg-blue-500"
                : "hover:bg-gray-700 hover:text-white"
            }`}
            aria-pressed={matchCase}
            title="Match case"
          >
            <CaseSensitive className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleMatchWholeWord}
            className={`cursor-pointer rounded-sm p-1 text-white/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
              matchWholeWord
                ? "bg-blue-500 text-white hover:bg-blue-500"
                : "hover:bg-gray-700 hover:text-white"
            }`}
            aria-pressed={matchWholeWord}
            title="Match whole word"
          >
            <WholeWord className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleUseRegex}
            className={`cursor-pointer rounded-sm p-1 text-white/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
              useRegex
                ? "bg-blue-500 text-white hover:bg-blue-500"
                : "hover:bg-gray-700 hover:text-white"
            }`}
            aria-pressed={useRegex}
            title="Use regular expression"
          >
            <Regex className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium ${searchStatusClass}`}>
          {searchStatusLabel}
        </span>
        <button
          type="button"
          onClick={() => runSearch("previous")}
          className="cursor-pointer rounded border border-transparent p-1 text-white/80 hover:bg-gray-700 hover:text-white focus:outline-none focus-visible:border-white/30 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-white/80"
          aria-label="Previous match"
          title="Previous match"
          disabled={searchNavigationDisabled}
        >
          <ArrowUp size={14} />
        </button>
        <button
          type="button"
          onClick={() => runSearch("next")}
          className="cursor-pointer rounded border border-transparent p-1 text-white/80 hover:bg-gray-700 hover:text-white focus:outline-none focus-visible:border-white/30 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-white/80"
          aria-label="Next match"
          title="Next match"
          disabled={searchNavigationDisabled}
        >
          <ArrowDown size={14} />
        </button>
      </div>
      <button
        type="button"
        onClick={handleClose}
        className="cursor-pointer rounded border border-transparent p-1 text-white/60 hover:bg-gray-700 hover:text-white focus:outline-none focus-visible:border-white/30"
        aria-label="Close find"
      >
        <X size={14} />
      </button>
    </div>
  );
}
