import { useUserSettings } from "@/hooks/useUserSettings";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BrowserPage } from "@/shared/types";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { StarredPagesMenu } from "./StarredPagesMenu";

const api = window.conduit;

type BrowserToolbarProps = {
  currentPage: BrowserPage;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onNavigate: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onRefresh: () => void;
  onStop: () => void;
};

export function BrowserToolbar({
  currentPage,
  isLoading,
  canGoBack,
  canGoForward,
  onNavigate,
  onGoBack,
  onGoForward,
  onRefresh,
  onStop,
}: BrowserToolbarProps) {
  const { urlHistory, addUrlToHistory, removeUrlFromHistory } =
    useUserSettings();

  const [inputUrl, setInputUrl] = useState<string>(currentPage.url);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  const closeDropdowns = useCallback(() => {
    setShowHistory(false);
  }, []);

  const handleUrlSubmit = useCallback(() => {
    let targetUrl = inputUrl.trim();
    if (targetUrl.length === 0) return;

    // Add protocol if missing
    if (!targetUrl.match(/^http(s)?:\/\//i)) {
      const lowerTarget = targetUrl.toLowerCase();
      const host = lowerTarget.split("/")[0];

      const isLocalhost = host === "localhost" || host.startsWith("localhost:");

      const protocol = isLocalhost ? "http" : "https";
      targetUrl = `${protocol}://${targetUrl}`;
    }

    addUrlToHistory(targetUrl);
    closeDropdowns();

    onNavigate(targetUrl);
  }, [inputUrl, addUrlToHistory, closeDropdowns, onNavigate]);

  const handleUrlInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputUrl(value);

      // If the user cleared the input bar, then
      // show the MRU history dropdown (if we have any).
      setShowHistory(value.trim().length === 0 && urlHistory.length > 0);
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

  // Update input URL when user navigates via in-page links or back/forward buttons
  useEffect(() => {
    setInputUrl(currentPage.url);
  }, [currentPage.url]);

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-surface-muted border-b border-white/10">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onGoBack}
            disabled={!canGoBack}
            className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Back</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onGoForward}
            disabled={!canGoForward}
            className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
            aria-label="Forward"
          >
            <ArrowRight className="w-4 h-4 text-white" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Forward</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={isLoading ? onStop : onRefresh}
            className="p-1.5 rounded hover:bg-white/10 transition"
            aria-label={isLoading ? "Stop" : "Refresh"}
          >
            {isLoading ? (
              <X className="w-4 h-4 text-white" />
            ) : (
              <RefreshCw className="w-4 h-4 text-white" />
            )}
          </button>
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
          <input
            type="text"
            value={inputUrl}
            onChange={handleUrlInputChange}
            onBlur={handleUrlInputBlur}
            onFocus={handleUrlInputFocus}
            className="flex-1 px-3 pr-20 py-1 text-sm bg-surface rounded border border-white/10 text-white placeholder-white/40 focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/30 overflow-hidden text-ellipsis"
            placeholder="Enter URL..."
          />
        </form>
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-0">
          <StarredPagesMenu
            currentPage={currentPage}
            onPageSelected={handleStarredNavigation}
            onMenuOpened={handleStarredCloseRequest}
          />
        </div>
        {showHistory && urlHistory.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-white/10 rounded shadow-lg z-10 max-h-48 overflow-y-auto">
            {urlHistory.map((historyUrl) => (
              <div
                key={historyUrl}
                className="group flex items-center border-b border-white/5 last:border-b-0 hover:bg-white/10 transition"
              >
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleHistoryItemClick(historyUrl)}
                  className="flex-1 px-3 py-2 text-sm text-left text-white transition overflow-hidden text-ellipsis whitespace-nowrap"
                >
                  {historyUrl}
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleHistoryItemRemove(historyUrl);
                  }}
                  className="px-2 py-2 text-white/50 hover:text-red-500 transition"
                  aria-label="Remove from history"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => api.openExternal(currentPage.url)}
            className="p-1.5 rounded hover:bg-white/10 transition"
            aria-label="Open in external browser"
          >
            <ExternalLink className="w-4 h-4 text-white" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Open in external browser</TooltipContent>
      </Tooltip>
    </div>
  );
}
