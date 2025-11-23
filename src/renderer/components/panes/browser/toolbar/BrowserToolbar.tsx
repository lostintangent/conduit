import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUserSettings } from "@/hooks/useUserSettings";
import { BrowserPage } from "@shared/types";
import { ArrowLeft, ArrowRight, RefreshCw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserMenu } from "./BrowserMenu";
import { StarredPagesMenu } from "./StarredPagesMenu";
import { ConsoleErrors, type ConsoleMessage } from "./ConsoleErrors";

const api = window.conduit;

type BrowserToolbarProps = {
  currentPage: BrowserPage;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  consoleErrors: ConsoleMessage[];
  onClearConsoleErrors: () => void;
  onRemoveConsoleError: (index: number) => void;
  onNavigate: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onRefresh: () => void;
  onStop: () => void;
  onOpenDevTools: () => void;
  onCaptureScreenshot: () => void;
};

export function BrowserToolbar({
  currentPage,
  isLoading,
  canGoBack,
  canGoForward,
  consoleErrors,
  onClearConsoleErrors,
  onRemoveConsoleError,
  onNavigate,
  onGoBack,
  onGoForward,
  onRefresh,
  onStop,
  onOpenDevTools,
  onCaptureScreenshot,
}: BrowserToolbarProps) {
  const { urlHistory, addUrlToHistory, removeUrlFromHistory } =
    useUserSettings();

  const [inputUrl, setInputUrl] = useState<string>(currentPage.url);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter history based on input text
  const filteredHistory = useMemo(() => {
    const searchText = inputUrl.trim().toLowerCase();
    // Don't filter if empty or "about:blank" (show all history)
    if (!searchText || searchText === "about:blank") {
      return urlHistory;
    }
    return urlHistory.filter((url) => url.toLowerCase().includes(searchText));
  }, [inputUrl, urlHistory]);

  const closeDropdowns = useCallback(() => {
    setShowHistory(false);
    setSelectedHistoryIndex(-1);
  }, []);

  const handleUrlSubmit = useCallback(() => {
    // If history is showing and an item is selected, navigate to it
    if (
      showHistory &&
      selectedHistoryIndex >= 0 &&
      selectedHistoryIndex < filteredHistory.length
    ) {
      const selectedUrl = filteredHistory[selectedHistoryIndex];
      setInputUrl(selectedUrl);
      onNavigate(selectedUrl);
      addUrlToHistory(selectedUrl);
      closeDropdowns();
      return;
    }

    let targetUrl = inputUrl.trim();
    if (targetUrl.length === 0) return;

    // Helper function to check if a host is localhost
    const checkIsLocalhost = (host: string) =>
      host === "localhost" || host.startsWith("localhost:");

    // Check if the input looks like a URL or a search query
    const isUrl = (() => {
      // If it already has a protocol, it's a URL
      if (targetUrl.match(/^[a-z][a-z0-9+.-]*:\/\//i)) {
        return true;
      }

      // If it contains spaces, it's likely a search query
      if (targetUrl.includes(" ")) {
        return false;
      }

      // Check if it looks like a domain with a TLD
      const host = targetUrl.split("/")[0];
      
      if (checkIsLocalhost(host)) {
        return true;
      }

      // Check if it has a valid TLD (at least one dot followed by 2+ characters)
      // This matches domains like google.com, github.io, co.uk, etc.
      const hasTLD = /\.[a-z]{2,}$/i.test(host);

      return hasTLD;
    })();

    if (!isUrl) {
      // Convert to DuckDuckGo search query
      targetUrl = `https://duckduckgo.com/?q=${encodeURIComponent(targetUrl)}`;
    } else if (!targetUrl.match(/^http(s)?:\/\//i)) {
      // Add protocol if missing for URLs
      const lowerTarget = targetUrl.toLowerCase();
      const host = lowerTarget.split("/")[0];
      const protocol = checkIsLocalhost(host) ? "http" : "https";
      targetUrl = `${protocol}://${targetUrl}`;
    }

    addUrlToHistory(targetUrl);
    closeDropdowns();

    onNavigate(targetUrl);
  }, [
    inputUrl,
    addUrlToHistory,
    closeDropdowns,
    onNavigate,
    showHistory,
    selectedHistoryIndex,
    filteredHistory,
  ]);

  const handleUrlInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputUrl(value);

      // Show history dropdown when there's input or when cleared (if history exists)
      if (urlHistory.length > 0) {
        setShowHistory(true);
      }
      setSelectedHistoryIndex(-1);
    },
    [urlHistory.length],
  );

  const handleUrlInputBlur = useCallback(() => {
    // Reset the input URL to the current URL after a short delay
    setInputUrl(currentPage.url);
    closeDropdowns();
  }, [currentPage.url, closeDropdowns]);

  const handleUrlInputFocus = useCallback(() => {
    if (inputUrl.trim().length === 0 && urlHistory.length > 0) {
      setShowHistory(true);
    }
  }, [inputUrl, urlHistory.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        if (showHistory) {
          closeDropdowns();
        } else {
          // Clear the input if history isn't showing
          setInputUrl("");
          // Show history if available
          if (urlHistory.length > 0) {
            setShowHistory(true);
          }
        }
        return;
      }

      if (!showHistory || filteredHistory.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedHistoryIndex((prev) => {
          if (prev < filteredHistory.length - 1) {
            return prev + 1;
          }
          return 0; // Wrap to top
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedHistoryIndex((prev) => {
          if (prev <= 0) {
            return filteredHistory.length - 1; // Wrap to bottom
          }
          return prev - 1;
        });
      }
    },
    [showHistory, filteredHistory.length, closeDropdowns, urlHistory.length],
  );

  const handleHistoryItemClick = useCallback(
    (historyUrl: string) => {
      setInputUrl(historyUrl);
      onNavigate(historyUrl);

      addUrlToHistory(historyUrl);
      closeDropdowns();
    },
    [addUrlToHistory, closeDropdowns, onNavigate],
  );

  const handleHistoryItemRemove = useCallback(
    (historyUrl: string) => {
      void removeUrlFromHistory(historyUrl);
    },
    [removeUrlFromHistory],
  );

  const handleStarredNavigation = useCallback(
    (pageUrl: string) => {
      setInputUrl(pageUrl);
      onNavigate(pageUrl);

      addUrlToHistory(pageUrl);
      closeDropdowns();
    },
    [addUrlToHistory, closeDropdowns, onNavigate],
  );

  const handleStarredCloseRequest = useCallback(() => {
    setShowHistory(false);
  }, []);

  // Helper to highlight matching text
  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) return text;

    return (
      <>
        {text.slice(0, index)}
        <span className="text-accent">
          {text.slice(index, index + query.length)}
        </span>
        {text.slice(index + query.length)}
      </>
    );
  };

  // On mount, if URL is blank, auto-focus and select all text
  useEffect(() => {
    if (currentPage.url === "about:blank" || currentPage.url === "") {
      inputRef.current?.focus();
      inputRef.current?.select();

      if (urlHistory.length > 0) {
        setShowHistory(true);
      }
    }
  }, []);

  // Update input URL when user navigates via in-page links or back/forward buttons
  useEffect(() => {
    setInputUrl(currentPage.url);

    // If a navigation just happened, then
    // lets close any dropdowns, under the assumption
    // that the user or the CLI just navigated.
    if (currentPage.url !== "about:blank") {
      closeDropdowns();
    }
  }, [currentPage.url]);

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-elevated border-b">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onGoBack}
            disabled={!canGoBack}
            aria-label="Back"
          >
            <ArrowLeft size={12} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Back</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onGoForward}
            disabled={!canGoForward}
            aria-label="Forward"
          >
            <ArrowRight size={12} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Forward</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={isLoading ? onStop : onRefresh}
            aria-label={isLoading ? "Stop" : "Refresh"}
          >
            {isLoading ? <X size={12} /> : <RefreshCw size={12} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isLoading ? "Stop" : "Refresh"}</TooltipContent>
      </Tooltip>
      <div className="relative flex-1 flex min-w-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleUrlSubmit();
          }}
          className="flex-1 flex min-w-0"
        >
          <InputGroup className="h-8">
            <InputGroupInput
              ref={inputRef}
              value={inputUrl}
              onChange={handleUrlInputChange}
              onBlur={handleUrlInputBlur}
              onFocus={handleUrlInputFocus}
              onKeyDown={handleKeyDown}
              className="text-sm"
              placeholder="Enter URL..."
            />
            <InputGroupAddon align="inline-end" className="gap-0">
              <StarredPagesMenu
                currentPage={currentPage}
                onPageSelected={handleStarredNavigation}
                onMenuOpened={handleStarredCloseRequest}
              />
            </InputGroupAddon>
          </InputGroup>
        </form>

        {showHistory && filteredHistory.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded shadow-lg z-10 max-h-48 overflow-y-auto">
            {filteredHistory.map((historyUrl, index) => (
              <div
                key={historyUrl}
                className={`group flex items-center border-b border-border last:border-b-0 hover:bg-accent/30 transition ${
                  index === selectedHistoryIndex ? "bg-accent/50" : ""
                }`}
              >
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleHistoryItemClick(historyUrl)}
                  className="flex-1 px-3 py-2 text-sm text-left transition overflow-hidden text-ellipsis whitespace-nowrap"
                >
                  {highlightMatch(historyUrl, inputUrl.trim())}
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleHistoryItemRemove(historyUrl);
                  }}
                  className="px-2 py-2 text-foreground/50 hover:text-destructive transition"
                  aria-label="Remove from history"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <ConsoleErrors
        errors={consoleErrors}
        onClear={onClearConsoleErrors}
        onRemove={onRemoveConsoleError}
      />
      <BrowserMenu
        currentPage={currentPage}
        onOpenDevTools={onOpenDevTools}
        onCaptureScreenshot={onCaptureScreenshot}
      />
    </div>
  );
}
