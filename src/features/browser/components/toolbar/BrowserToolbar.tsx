import { Button } from "@/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import { libraryMutations, useLibrary } from "@features/browser/client/queries";
import { normalizeUrl } from "@features/browser/client/url";
import type { BrowserLibrary, BrowserPage } from "@features/browser/model";
import { cn } from "@/utils/index";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, RefreshCw, Star, X } from "lucide-react";
import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { BrowserMenu } from "./BrowserMenu";
import { ConsoleErrors, type ConsoleMessage } from "./ConsoleErrors";
import { StarButton } from "./StarButton";

/** The address bar suggests at most this many pages */
const SUGGESTION_LIMIT = 8;
/** Of which this many can be favorites, which come first */
const FAVORITE_SUGGESTION_LIMIT = 3;

type Suggestion = BrowserPage & { isFavorite: boolean };

/**
 * The pages whose address or title has the text, favorites first, then the
 * pages the user visited most recently. Empty text matches every page.
 */
function suggestPages(
  { favorites, history }: BrowserLibrary,
  text: string,
): Suggestion[] {
  const query = text.trim().toLowerCase();
  const matches = ({ url, title }: BrowserPage) =>
    url.toLowerCase().includes(query) || title.toLowerCase().includes(query);

  const shownFavorites = favorites
    .filter(matches)
    .slice(0, FAVORITE_SUGGESTION_LIMIT);
  const visited = history.filter(
    (page) =>
      matches(page) && !shownFavorites.some(({ url }) => url === page.url),
  );
  return [
    ...shownFavorites.map((page) => ({ ...page, isFavorite: true })),
    ...visited.map(({ url, title }) => ({ url, title, isFavorite: false })),
  ].slice(0, SUGGESTION_LIMIT);
}

/** The address to edit, which is empty for a blank page */
const editableAddress = (url: string) => (url === "about:blank" ? "" : url);

/** The address while the user isn't editing it, without https:// or www. */
const shownAddress = (url: string) =>
  editableAddress(url).replace(/^https:\/\/(www\.)?/, "");

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
  /**
   * Leaves the address bar for the page, once it goes to an address or on an
   * Escape with nothing left to put back
   */
  onDismiss: () => void;
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
  const library = useLibrary((library) => library);
  const { mutate: removeFromHistory } = useMutation(
    libraryMutations.removeFromHistory(),
  );

  const [inputUrl, setInputUrl] = useState(() =>
    editableAddress(currentPage.url),
  );
  const [isEditing, setIsEditing] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const focusAddressBar = () => {
    inputRef.current?.focus();
    inputRef.current?.select();
  };
  useImperativeHandle(ref, () => ({ focusAddressBar }), []);

  // The full address replaces the shown one as editing starts, so it's
  // selected once it's there
  useLayoutEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  // A click that focuses the field selects the whole address, as browsers do,
  // since the address it clicked has changed under it
  const selectOnMouseUpRef = useRef(false);
  const handleMouseUp = (event: React.MouseEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    if (
      selectOnMouseUpRef.current &&
      input.selectionStart === input.selectionEnd
    ) {
      event.preventDefault();
      input.select();
    }
    selectOnMouseUpRef.current = false;
  };

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

  const suggestions = suggestPages(library, inputUrl);

  const closeDropdowns = () => {
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const navigateTo = (url: string) => {
    closeDropdowns();
    onNavigate(url);
    onDismiss();
  };

  const handleUrlSubmit = () => {
    const selected = showSuggestions ? suggestions[selectedIndex] : undefined;
    const url = selected ? selected.url : normalizeUrl(inputUrl);
    if (url.length > 0) navigateTo(url);
  };

  const handleUrlInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputUrl(e.target.value);
    setIsEditing(true);
    setShowSuggestions(true);
    setSelectedIndex(-1);
  };

  const handleUrlInputBlur = () => {
    setIsEditing(false);
    setInputUrl(editableAddress(currentPage.url));
    closeDropdowns();
  };

  const handleUrlInputFocus = () => {
    setIsEditing(true);
    if (inputUrl.trim().length === 0) setShowSuggestions(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      // Typing opens the suggestions, so while they're open, the page's
      // address goes back in, selected to type over, as Safari does
      if (showSuggestions) {
        const field = e.currentTarget;
        flushSync(() => {
          closeDropdowns();
          setInputUrl(editableAddress(currentPage.url));
        });
        field.select();
      } else {
        onDismiss();
      }
      return;
    }

    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev <= 0 ? suggestions.length - 1 : prev - 1,
      );
    }
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
      setShowSuggestions(true);
    }
  }, [isInPreview]);

  // Update input URL when user navigates via in-page links or back/forward buttons
  useEffect(() => {
    setInputUrl(editableAddress(currentPage.url));

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
      <Popover open={showSuggestions && suggestions.length > 0}>
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
                  value={isEditing ? inputUrl : shownAddress(currentPage.url)}
                  onChange={handleUrlInputChange}
                  onBlur={handleUrlInputBlur}
                  onFocus={handleUrlInputFocus}
                  onMouseDown={() => {
                    selectOnMouseUpRef.current = !isEditing;
                  }}
                  onMouseUp={handleMouseUp}
                  onKeyDown={handleKeyDown}
                  className="text-sm"
                  placeholder="Search or enter address"
                />
                <InputGroupAddon align="inline-end">
                  <StarButton currentPage={currentPage} />
                </InputGroupAddon>
              </InputGroup>
            </form>
          </div>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-(--radix-popover-trigger-width) max-h-(--radix-popover-content-available-height) p-0 overflow-y-auto"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div role="listbox" aria-label="Suggestions">
            {suggestions.map((page, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={page.url}
                  className={cn(
                    "group flex items-center border-b border-border last:border-b-0 hover:bg-accent/30 transition",
                    isSelected && "bg-accent/50",
                  )}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => navigateTo(page.url)}
                    className="flex-1 min-w-0 px-3 py-2 text-left"
                  >
                    <span className="block text-sm truncate">
                      {highlightMatch(page.title || page.url, inputUrl.trim())}
                    </span>
                    <span className="block text-xs text-foreground/50 truncate">
                      {highlightMatch(page.url, inputUrl.trim())}
                    </span>
                  </button>
                  {page.isFavorite ? (
                    <Star
                      aria-hidden
                      className="mr-3 size-3.5 shrink-0 fill-current text-yellow-400"
                    />
                  ) : (
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => removeFromHistory(page.url)}
                      className={cn(
                        "mr-1.5 p-1.5 shrink-0 text-foreground/50 hover:text-foreground opacity-0 group-hover:opacity-100 transition",
                        isSelected && "opacity-100",
                      )}
                      aria-label="Remove from history"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
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
