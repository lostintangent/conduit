import { Button } from "@/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import { libraryMutations, useLibrary } from "@features/browser/client/queries";
import { normalizeUrl } from "@features/browser/client/url";
import type { BrowserPage } from "@features/browser/model";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, RefreshCw, Trash2, X } from "lucide-react";
import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { BrowserMenu } from "./BrowserMenu";
import { ConsoleErrors, type ConsoleMessage } from "./ConsoleErrors";
import { StarredPagesMenu } from "./StarredPagesMenu";

/** The address bar suggests this many of the pages the user visited. */
const SUGGESTION_LIMIT = 5;

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
  isDevToolsOpen: boolean;
  onToggleDevTools: () => void;
  onHideToolbar: () => void;
  onCaptureScreenshot: () => Promise<void>;
  tabId?: string;
  isInPreview?: boolean;
  /** Takes Escape once there's no dropdown left for it to close */
  onDismiss?: () => void;
  /** Called when focus leaves the toolbar and its menus */
  onFocusLeave?: () => void;
  ref?: Ref<BrowserToolbarHandle>;
};

export type BrowserToolbarHandle = {
  focusAddressBar: () => void;
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
  isDevToolsOpen,
  onToggleDevTools,
  onHideToolbar,
  onCaptureScreenshot,
  tabId,
  isInPreview = false,
  onDismiss,
  onFocusLeave,
  ref,
}: BrowserToolbarProps) {
  const history = useLibrary((library) => library.history);
  const { mutate: removeFromHistory } = useMutation(
    libraryMutations.removeFromHistory(),
  );

  const [inputUrl, setInputUrl] = useState<string>(currentPage.url);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const focusAddressBar = () => {
    inputRef.current?.focus();
    inputRef.current?.select();
  };
  useImperativeHandle(ref, () => ({ focusAddressBar }), []);

  // Focus moving into a menu's portal still bubbles through React to the
  // toolbar, so a blur only counts if no focus inside follows it
  const focusLeaveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleToolbarBlur = () => {
    if (!onFocusLeave) return;
    focusLeaveTimerRef.current = setTimeout(() => {
      // When the window loses focus, the toolbar keeps it
      if (!toolbarRef.current?.contains(document.activeElement)) {
        onFocusLeave();
      }
    });
  };

  // The latest pages whose address has the input text, or the latest of all
  // when the input is empty or "about:blank"
  const searchText = inputUrl.trim().toLowerCase();
  const filteredHistory = (
    !searchText || searchText === "about:blank"
      ? history
      : history.filter(({ url }) => url.toLowerCase().includes(searchText))
  )
    .slice(0, SUGGESTION_LIMIT)
    .map(({ url }) => url);

  const closeDropdowns = () => {
    setShowHistory(false);
    setSelectedHistoryIndex(-1);
  };

  const handleUrlSubmit = () => {
    // If history is showing and an item is selected, navigate to it
    if (
      showHistory &&
      selectedHistoryIndex >= 0 &&
      selectedHistoryIndex < filteredHistory.length
    ) {
      const selectedUrl = filteredHistory[selectedHistoryIndex];
      setInputUrl(selectedUrl);
      onNavigate(selectedUrl);
      closeDropdowns();
      return;
    }

    const targetUrl = normalizeUrl(inputUrl);
    if (targetUrl.length === 0) return;

    closeDropdowns();

    onNavigate(targetUrl);
  };

  const handleUrlInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputUrl(value);

    // Show history dropdown when there's input or when cleared (if history exists)
    if (history.length > 0) {
      setShowHistory(true);
    }
    setSelectedHistoryIndex(-1);
  };

  const handleUrlInputBlur = () => {
    // Reset the input URL to the current URL after a short delay
    setInputUrl(currentPage.url);
    closeDropdowns();
  };

  const handleUrlInputFocus = () => {
    if (inputUrl.trim().length === 0 && history.length > 0) {
      setShowHistory(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (showHistory) {
        closeDropdowns();
      } else if (onDismiss) {
        onDismiss();
      } else {
        // Clear the input if history isn't showing
        setInputUrl("");
        // Show history if available
        if (history.length > 0) {
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
  };

  const handleHistoryItemClick = (historyUrl: string) => {
    setInputUrl(historyUrl);
    onNavigate(historyUrl);
    closeDropdowns();
  };

  const handleHistoryItemRemove = (historyUrl: string) => {
    removeFromHistory(historyUrl);
  };

  const handleStarredNavigation = (pageUrl: string) => {
    setInputUrl(pageUrl);
    onNavigate(pageUrl);
    closeDropdowns();
  };

  const handleStarredCloseRequest = () => {
    setShowHistory(false);
  };

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

  // A new pane with a blank page focuses its URL the first time it's shown,
  // outside a hover preview. Effects run again each time its tab is shown.
  const didAutoFocusRef = useRef(false);
  useEffect(() => {
    if (didAutoFocusRef.current || isInPreview) return;
    didAutoFocusRef.current = true;
    if (currentPage.url === "about:blank" || currentPage.url === "") {
      focusAddressBar();

      if (history.length > 0) {
        setShowHistory(true);
      }
    }
  }, [isInPreview]);

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
    <div
      ref={toolbarRef}
      className="flex items-center gap-1 px-2 py-1.5 bg-elevated border-b"
      onBlur={handleToolbarBlur}
      onFocus={() => clearTimeout(focusLeaveTimerRef.current)}
    >
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
      <Popover open={showHistory && filteredHistory.length > 0}>
        <PopoverTrigger asChild>
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
          </div>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-[--radix-popover-trigger-width] p-0 max-h-48 overflow-y-auto"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
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
        </PopoverContent>
      </Popover>
      <ConsoleErrors
        errors={consoleErrors}
        onClear={onClearConsoleErrors}
        onRemove={onRemoveConsoleError}
      />
      <BrowserMenu
        currentPage={currentPage}
        isDevToolsOpen={isDevToolsOpen}
        onToggleDevTools={onToggleDevTools}
        onHideToolbar={onHideToolbar}
        onCaptureScreenshot={onCaptureScreenshot}
        tabId={tabId}
      />
    </div>
  );
}
