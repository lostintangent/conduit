import { useUserSettings } from "@/hooks/useUserSettings";
import { applicationModeAtom } from "@/store/atoms";
import {
  applyWebviewScaling,
  calculateWebviewScale,
} from "@/utils/preview-scaling";
import type {
  ContextMenuParams,
  DidNavigateEvent,
  DidNavigateInPageEvent,
  PageTitleUpdatedEvent,
  WebviewTag,
} from "electron";
import { useAtomValue } from "jotai";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ExternalLink,
  Loader2,
  RefreshCw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const api = window.conduit;

type BrowserPaneProps = {
  url: string;
  paneId: string;

  onUrlChange: (url: string) => void;
  onTitleChange: (title: string) => void;

  // TODO: See if we can remove the X/Y coordinates and let Electron handle it internally
  onContextMenu: (coords: { clientX: number; clientY: number }) => void;
  onHover: (isHovering: boolean) => void;

  disableInteraction: boolean;
  isInPreview: boolean;
};

export function BrowserPane({
  url,
  paneId,
  onTitleChange,
  onUrlChange,
  onContextMenu,
  onHover,
  disableInteraction = false,
  isInPreview = false,
}: BrowserPaneProps) {
  const {
    urlHistory,
    addUrlToHistory,
    removeUrlFromHistory,
    starredPages = [],
    addStarredPage,
    removeStarredPage,
    updateStarredPage,
  } = useUserSettings();
  const applicationMode = useAtomValue(applicationModeAtom);

  const webviewRef = useRef<WebviewTag | null>(null);
  const webviewAnchorRef = useRef<HTMLDivElement | null>(null);
  const starButtonRef = useRef<HTMLButtonElement | null>(null);
  const starMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const starredDropdownRef = useRef<HTMLDivElement | null>(null);

  const previewOverlayRef = useRef<HTMLDivElement | null>(null);
  const isPreviewHoveredRef = useRef(false);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentUrl, setCurrentUrl] = useState<string>(url);
  const [inputUrl, setInputUrl] = useState<string>(url);
  const [pageTitle, setPageTitle] = useState<string>("");

  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [canGoForward, setCanGoForward] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [showStarredList, setShowStarredList] = useState<boolean>(false);

  const hasStarredPages = starredPages.length > 0;
  const isCurrentUrlStarred = starredPages.some(
    (page) => page.url === currentUrl,
  );

  const closeDropdowns = useCallback(() => {
    setShowHistory(false);
    setShowStarredList(false);
  }, []);

  // After the component is mounted, we need to create or attach
  // to the <wevbview> element for this pane
  useEffect(() => {
    if (!webviewAnchorRef.current) return;

    let webview = document.getElementById(paneId) as WebviewTag | null;
    if (!webview) {
      // Create a new webview
      webview = document.createElement("webview") as WebviewTag;
      webview.src = url;
      webview.id = paneId;
      webview.style.position = "absolute";
      webview.style.overflow = "hidden";

      document.body.appendChild(webview);

      setIsLoading(true);
    } else {
      // Attach to existing webview
      setIsLoading(webview.isLoading ? webview.isLoading() : false);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
      const initialTitle =
        typeof webview?.getTitle === "function" ? webview.getTitle() : "";
      setPageTitle(typeof initialTitle === "string" ? initialTitle.trim() : "");
    }

    webviewRef.current = webview;
    setCurrentUrl(url);
    setInputUrl(url);

    // Because the webview is absolutely positioned and scaled
    // while in preview mode, we unfortunately need to implement
    // the hover overlay again, since the webview will be on top of
    // the pane's own hover detection.
    const ensurePreviewOverlay = () => {
      if (!isInPreview || !isPreviewHoveredRef.current) {
        if (previewOverlayRef.current) {
          previewOverlayRef.current.remove();
          previewOverlayRef.current = null;
        }
        return;
      }

      if (!previewOverlayRef.current) {
        const overlay = document.createElement("div");
        overlay.className =
          "pointer-events-none bg-blueprint/30 backdrop-blur-[0.5px]";
        overlay.style.position = "absolute";
        overlay.style.zIndex = "10005";
        overlay.style.pointerEvents = "none";

        previewOverlayRef.current = overlay;
        document.body.appendChild(overlay);
      }
    };

    const updatePosition = () => {
      const anchor = webviewAnchorRef.current;
      const currentWebview = webviewRef.current;
      if (!anchor || !currentWebview) {
        return;
      }

      ensurePreviewOverlay();

      // Set z-index based on preview mode
      currentWebview.style.zIndex = isInPreview ? "10001" : "1";

      // Schedule follow-up update in preview mode
      if (isInPreview) {
        requestAnimationFrame(updatePosition);
      }

      const rect = anchor.getBoundingClientRect();
      const layoutWidth =
        anchor.offsetWidth || anchor.clientWidth || rect.width;
      const layoutHeight =
        anchor.offsetHeight || anchor.clientHeight || rect.height;

      const scrollX = window.scrollX ?? window.pageXOffset;
      const scrollY = window.scrollY ?? window.pageYOffset;
      const top = rect.top + scrollY;
      const left = rect.left + scrollX;

      currentWebview.style.top = `${top}px`;
      currentWebview.style.left = `${left}px`;

      const scaling = calculateWebviewScale({
        layoutWidth,
        layoutHeight,
        rectWidth: rect.width,
        rectHeight: rect.height,
      });

      applyWebviewScaling(currentWebview, scaling);

      const overlay = previewOverlayRef.current;
      if (overlay) {
        overlay.style.top = `${top}px`;
        overlay.style.left = `${left}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
        overlay.style.borderRadius =
          getComputedStyle(anchor).borderRadius ?? "";
      }
    };

    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(webviewAnchorRef.current);

    updatePosition();

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);

      resizeObserver.disconnect();

      if (previewOverlayRef.current) {
        previewOverlayRef.current.remove();
        previewOverlayRef.current = null;
      }

      if (webviewRef.current === webview) {
        webview.style.zIndex = "1";
        webview.style.transform = "";
        webview.style.transformOrigin = "";
        webviewRef.current = null;
      }
    };
  }, [webviewAnchorRef]);

  // Once we have a new or existing webview, we need to hook
  // up the event listeners to it (e.g. navigation, title change, etc)
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleStopLoading = () => {
      setIsLoading(false);

      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    };

    const handleStartLoading = () => setIsLoading(true);

    const handleDidNavigate = ({
      url,
    }: DidNavigateEvent | DidNavigateInPageEvent) => {
      setCurrentUrl(url);
      setInputUrl(url);
      const updatedTitle =
        typeof webview.getTitle === "function" ? webview.getTitle() : "";
      setPageTitle(typeof updatedTitle === "string" ? updatedTitle.trim() : "");

      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());

      onUrlChange(url);
    };

    const notifyTitleChange = ({ title }: PageTitleUpdatedEvent) => {
      const normalizedTitle = typeof title === "string" ? title.trim() : "";
      setPageTitle(normalizedTitle);
      onTitleChange(title);
    };

    const handleWebViewContextMenu = (
      event: Event & { params?: ContextMenuParams },
    ) => {
      const { left, top } = webview.getBoundingClientRect();
      const { x, y } = event.params;

      onContextMenu?.({
        clientX: left + x,
        clientY: top + y,
      });
    };

    const handleWebViewMouseEnter = () => {
      isPreviewHoveredRef.current = true;
      onHover(true);
    };

    const handleWebViewMouseLeave = () => {
      isPreviewHoveredRef.current = false;
      onHover(false);
    };

    webview.addEventListener("did-start-loading", handleStartLoading);
    webview.addEventListener("did-stop-loading", handleStopLoading);
    webview.addEventListener("did-finish-load", handleStopLoading);

    webview.addEventListener("did-navigate", handleDidNavigate);
    webview.addEventListener("did-navigate-in-page", handleDidNavigate);

    webview.addEventListener("page-title-updated", notifyTitleChange);
    webview.addEventListener("context-menu", handleWebViewContextMenu);

    webview.addEventListener("mouseenter", handleWebViewMouseEnter);
    webview.addEventListener("mouseleave", handleWebViewMouseLeave);

    return () => {
      webview.removeEventListener("did-start-loading", handleStartLoading);
      webview.removeEventListener("did-stop-loading", handleStopLoading);
      webview.removeEventListener("did-finish-load", handleStopLoading);

      webview.removeEventListener("did-navigate", handleDidNavigate);
      webview.removeEventListener("did-navigate-in-page", handleDidNavigate);

      webview.removeEventListener("page-title-updated", notifyTitleChange);
      webview.removeEventListener("context-menu", handleWebViewContextMenu);

      webview.removeEventListener("mouseenter", handleWebViewMouseEnter);
      webview.removeEventListener("mouseleave", handleWebViewMouseLeave);
    };
  }, [webviewRef]);

  // Enable/disable pointer events for the wewbview
  // whenever the parent asks for it (e.g. during a resize action)
  useEffect(() => {
    if (!webviewRef.current) return;

    webviewRef.current.style.pointerEvents = disableInteraction
      ? "none"
      : "auto";
  }, [disableInteraction]);

  // When rendered in focus mode, we need to add
  // rounded corners to the bottom of the webview,
  // to match the rounded corners of the window.
  useEffect(() => {
    if (!webviewRef.current) return;

    webviewRef.current.classList.toggle(
      "rounded-b-xl",
      applicationMode === "focus",
    );
  }, [applicationMode]);

  useEffect(() => {
    if (!showStarredList) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        starButtonRef.current?.contains(target) ||
        starMenuButtonRef.current?.contains(target) ||
        starredDropdownRef.current?.contains(target)
      ) {
        return;
      }

      setShowStarredList(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showStarredList]);

  useEffect(() => {
    if (showHistory) {
      setShowStarredList(false);
    }
  }, [showHistory]);

  useEffect(() => {
    setShowStarredList(false);
  }, [currentUrl]);

  useEffect(() => {
    if (!hasStarredPages) {
      setShowStarredList(false);
    }
  }, [hasStarredPages]);

  useEffect(() => {
    if (!currentUrl) return;

    const trimmedTitle = pageTitle.trim();
    if (trimmedTitle.length === 0) {
      return;
    }

    const starredPage = starredPages.find((page) => page.url === currentUrl);
    if (starredPage && starredPage.title !== trimmedTitle) {
      void updateStarredPage({ url: currentUrl, title: trimmedTitle });
    }
  }, [currentUrl, pageTitle, starredPages, updateStarredPage]);

  /* URL bar handlers */

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

    webviewRef.current?.loadURL(targetUrl);
  }, [inputUrl, addUrlToHistory, closeDropdowns]);

  const handleUrlInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputUrl(value);

      // If the user cleared the input bar, then
      // show the MRU history dropdown (if we have any).
      setShowHistory(value.trim().length === 0 && urlHistory.length > 0);
      setShowStarredList(false);
    },
    [urlHistory.length],
  );

  const handleUrlInputBlur = useCallback(() => {
    // Reset the input URL to the current URL after a short delay
    setInputUrl(currentUrl);
    closeDropdowns();
  }, [currentUrl, closeDropdowns]);

  const handleUrlInputFocus = useCallback(() => {
    if (inputUrl.trim().length === 0 && urlHistory.length > 0) {
      setShowHistory(true);
    }
    setShowStarredList(false);
  }, [inputUrl, urlHistory.length]);

  const handleHistoryItemClick = useCallback(
    (historyUrl: string) => {
      setInputUrl(historyUrl);
      webviewRef.current?.loadURL(historyUrl);

      addUrlToHistory(historyUrl);
      closeDropdowns();
    },
    [addUrlToHistory, closeDropdowns],
  );

  const handleHistoryItemRemove = useCallback(
    (historyUrl: string) => {
      void removeUrlFromHistory(historyUrl);
    },
    [removeUrlFromHistory],
  );

  const handleToggleStar = useCallback(() => {
    if (!currentUrl) {
      return;
    }

    if (isCurrentUrlStarred) {
      void removeStarredPage(currentUrl);
    } else {
      const trimmedTitle = pageTitle.trim();
      void addStarredPage({
        url: currentUrl,
        title: trimmedTitle.length > 0 ? trimmedTitle : currentUrl,
      });
    }

    closeDropdowns();
  }, [
    currentUrl,
    isCurrentUrlStarred,
    pageTitle,
    addStarredPage,
    removeStarredPage,
    closeDropdowns,
  ]);

  const handleStarredDropdownToggle = useCallback(() => {
    if (!hasStarredPages) {
      return;
    }

    setShowStarredList((value) => !value);
    setShowHistory(false);
  }, [hasStarredPages]);

  const handleStarredNavigation = useCallback(
    (pageUrl: string) => {
      setInputUrl(pageUrl);
      webviewRef.current?.loadURL(pageUrl);

      addUrlToHistory(pageUrl);
      closeDropdowns();
    },
    [addUrlToHistory, closeDropdowns],
  );

  const handleStarredRemove = useCallback(
    (pageUrl: string) => {
      void removeStarredPage(pageUrl);
    },
    [removeStarredPage],
  );

  return (
    <div className="relative flex flex-col flex-1 w-full h-full min-w-0 min-h-0 bg-surface">
      {/* URL Bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-surface-muted border-b border-white/10">
        <button
          type="button"
          onClick={() => webviewRef.current?.goBack()}
          disabled={!canGoBack}
          className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
          title="Back"
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <button
          type="button"
          onClick={() => webviewRef.current?.goForward()}
          disabled={!canGoForward}
          className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
          title="Forward"
        >
          <ArrowRight className="w-4 h-4 text-white" />
        </button>
        <button
          type="button"
          onClick={
            isLoading
              ? () => webviewRef.current?.stop()
              : () => webviewRef.current?.reload()
          }
          className="p-1.5 rounded hover:bg-white/10 transition"
          title={isLoading ? "Stop" : "Refresh"}
        >
          {isLoading ? (
            <X className="w-4 h-4 text-white" />
          ) : (
            <RefreshCw className="w-4 h-4 text-white" />
          )}
        </button>
        <div className="relative flex-1 flex min-w-0">
          <form onSubmit={handleUrlSubmit} className="flex-1 flex min-w-0">
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
            <button
              ref={starButtonRef}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleToggleStar}
              className={`pointer-events-auto p-1 rounded transition-colors ${
                isCurrentUrlStarred
                  ? "text-yellow-400 hover:text-yellow-300"
                  : "text-white/70 hover:text-white"
              }`}
              aria-pressed={isCurrentUrlStarred}
              title={
                isCurrentUrlStarred ? "Unstar this page" : "Star this page"
              }
            >
              <Star
                className="w-4 h-4"
                fill={isCurrentUrlStarred ? "currentColor" : "none"}
              />
            </button>
            <button
              ref={starMenuButtonRef}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleStarredDropdownToggle}
              className={`pointer-events-auto p-1 rounded transition-colors ${
                !hasStarredPages
                  ? "text-white/40 cursor-not-allowed"
                  : "text-white/70 hover:text-white"
              }`}
              title="Show starred pages"
              aria-haspopup="listbox"
              aria-expanded={showStarredList}
              disabled={!hasStarredPages}
            >
              <ChevronDown className="w-4 h-4" />
            </button>
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
          {showStarredList && hasStarredPages && (
            <div
              ref={starredDropdownRef}
              className="absolute top-full right-0 mt-1 w-72 bg-surface border border-white/10 rounded shadow-lg z-20 max-h-56 overflow-y-auto"
              role="listbox"
            >
              {starredPages.map((page) => {
                const displayTitle = page.title?.trim().length
                  ? page.title
                  : page.url;
                return (
                  <div
                    key={page.url}
                    className="group flex items-center border-b border-white/5 last:border-b-0 hover:bg-white/10 transition"
                  >
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleStarredNavigation(page.url)}
                      className="flex-1 px-3 py-2 text-left text-white transition overflow-hidden"
                      role="option"
                    >
                      <span className="block text-sm truncate">
                        {displayTitle}
                      </span>
                      <span className="block text-xs text-white/50 truncate">
                        {page.url}
                      </span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleStarredRemove(page.url);
                      }}
                      className="px-2 py-2 text-yellow-400 hover:text-yellow-300 transition"
                      aria-label="Unstar this page"
                    >
                      <Star className="w-4 h-4" fill="currentColor" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => api.openExternal(currentUrl)}
          className="p-1.5 rounded hover:bg-white/10 transition"
          title="Open in external browser"
        >
          <ExternalLink className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* WebView */}
      <div className="relative flex flex-1 w-full h-full min-w-0 min-h-0">
        <div
          ref={webviewAnchorRef}
          className="absolute inset-0 pointer-events-none"
          aria-hidden
        />
        {isLoading && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/20">
            <Loader2 className="h-8 w-8 text-white/80 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
