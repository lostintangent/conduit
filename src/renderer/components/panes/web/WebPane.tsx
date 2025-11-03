import { useUserSettings } from "@/hooks/useUserSettings";
import {
  applyWebviewScaling,
  calculateWebviewScale,
  getPreviewScaleFromContainer,
} from "@/utils/preview-scaling";
import type {
  ContextMenuParams,
  DidNavigateEvent,
  DidNavigateInPageEvent,
  PageTitleUpdatedEvent,
  WebviewTag,
} from "electron";
import { ArrowLeft, ArrowRight, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const api = window.conduit;

// Delay before hiding history dropdown to allow clicking on items
const HISTORY_DROPDOWN_HIDE_DELAY = 200;

type WebPaneProps = {
  url: string;
  paneId: string;
  onTitleChange?: (title: string) => void;
  onUrlChange?: (url: string) => void;
  disableInteraction?: boolean;
  onContextMenu?: (coords: { clientX: number; clientY: number }) => void;
};

export function WebPane({
  url,
  paneId,
  onTitleChange,
  onUrlChange,
  disableInteraction = false,
  onContextMenu,
}: WebPaneProps) {
  const webviewRef = useRef<WebviewTag | null>(null);
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);
  const mountContextRef = useRef<"layout" | "preview">("layout");
  const followUpFrameRef = useRef<number | null>(null);
  const followUpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentUrl, setCurrentUrl] = useState<string>(url);
  const [inputUrl, setInputUrl] = useState<string>(url);
  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [canGoForward, setCanGoForward] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const hasInitializedRef = useRef(false);
  const currentUrlRef = useRef(url);
  const { urlHistory, addUrlToHistory } = useUserSettings();
  const handleContainerRef = useCallback((node: HTMLDivElement | null) => {
    setContainerNode(node);
  }, []);

  useEffect(() => {
    const container = containerNode;
    if (!container) {
      return;
    }

    let webview = document.getElementById(paneId) as WebviewTag | null;
    if (!webview) {
      webview = document.createElement("webview") as WebviewTag;
      webview.setAttribute("src", url);
      webview.id = paneId;
      webview.style.position = "absolute";
      webview.style.zIndex = "1";

      hasInitializedRef.current = false;
      document.body.appendChild(webview);
    }

    webviewRef.current = webview;

    const scheduleFollowUpUpdate = () => {
      if (followUpFrameRef.current !== null) {
        cancelAnimationFrame(followUpFrameRef.current);
      }
      followUpFrameRef.current = requestAnimationFrame(() => {
        followUpFrameRef.current = null;
        updatePosition();
      });

      if (followUpTimeoutRef.current !== null) {
        clearTimeout(followUpTimeoutRef.current);
      }
      followUpTimeoutRef.current = window.setTimeout(() => {
        followUpTimeoutRef.current = null;
        updatePosition();
      }, 150);
    };

    const updatePosition = () => {
      const anchor = container;
      const currentWebview = webviewRef.current;
      if (!anchor || !currentWebview) {
        return;
      }

      const previewContainer = anchor.closest(
        "[data-tab-preview-container='true']"
      ) as HTMLElement | null;
      const nextContext: "layout" | "preview" = previewContainer
        ? "preview"
        : "layout";

      if (mountContextRef.current !== nextContext) {
        mountContextRef.current = nextContext;
        currentWebview.style.zIndex = nextContext === "preview" ? "10001" : "1";
        if (nextContext === "preview") {
          scheduleFollowUpUpdate();
        }
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

      const previewScale = getPreviewScaleFromContainer(anchor);
      const scaling = calculateWebviewScale({
        layoutWidth,
        layoutHeight,
        rectWidth: rect.width,
        rectHeight: rect.height,
        previewScale,
      });

      applyWebviewScaling(currentWebview, scaling);
    };

    const resizeObserver = new ResizeObserver(() => updatePosition());
    resizeObserver.observe(container);

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      resizeObserver.disconnect();
      if (followUpFrameRef.current !== null) {
        cancelAnimationFrame(followUpFrameRef.current);
        followUpFrameRef.current = null;
      }
      if (followUpTimeoutRef.current !== null) {
        clearTimeout(followUpTimeoutRef.current);
        followUpTimeoutRef.current = null;
      }

      if (webviewRef.current === webview) {
        webview.style.zIndex = "1";
        webview.style.transform = "";
        webview.style.transformOrigin = "";
        webviewRef.current = null;
      }

      mountContextRef.current = "layout";
    };
  }, [paneId, containerNode]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }

    webview.style.pointerEvents = disableInteraction ? "none" : "auto";
  }, [disableInteraction, paneId]);

  useEffect(() => {
    currentUrlRef.current = currentUrl;
  }, [currentUrl]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setCurrentUrl(url);
      setInputUrl(url);
      currentUrlRef.current = url;
      return;
    }

    if (url === currentUrlRef.current) {
      return;
    }

    currentUrlRef.current = url;
    setCurrentUrl(url);
    setInputUrl(url);
    webview.loadURL(url);
  }, [url, paneId]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleStopLoading = () => {
      setIsLoading(false);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    };

    const handleStartLoading = () => setIsLoading(true);

    const handleDidNavigate = (event: DidNavigateEvent) => {
      const nextUrl = event.url;
      const previousUrl = currentUrlRef.current;
      setCurrentUrl(nextUrl);
      setInputUrl(nextUrl);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
      if (previousUrl !== nextUrl) {
        currentUrlRef.current = nextUrl;
        onUrlChange?.(nextUrl);
      } else {
        currentUrlRef.current = nextUrl;
      }
    };

    const handleDidNavigateInPage = (event: DidNavigateInPageEvent) => {
      const nextUrl = event.url;
      const previousUrl = currentUrlRef.current;
      setCurrentUrl(nextUrl);
      setInputUrl(nextUrl);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
      if (previousUrl !== nextUrl) {
        currentUrlRef.current = nextUrl;
        onUrlChange?.(nextUrl);
      } else {
        currentUrlRef.current = nextUrl;
      }
    };

    webview.addEventListener("did-start-loading", handleStartLoading);
    webview.addEventListener("did-stop-loading", handleStopLoading);
    webview.addEventListener("did-finish-load", handleStopLoading);
    webview.addEventListener("did-navigate", handleDidNavigate);
    webview.addEventListener("did-navigate-in-page", handleDidNavigateInPage);

    const notifyTitleChange = (event: PageTitleUpdatedEvent) =>
      onTitleChange?.(event.title);
    webview.addEventListener("page-title-updated", notifyTitleChange);

    const handleWebViewContextMenu = (
      event: Event & { params?: ContextMenuParams }
    ) => {
      if (!event.params) {
        return;
      }

      event.preventDefault();

      const { left, top } = webview.getBoundingClientRect();
      const { x, y } = event.params;

      onContextMenu?.({
        clientX: left + x,
        clientY: top + y,
      });
    };

    webview.addEventListener("context-menu", handleWebViewContextMenu);

    return () => {
      webview.removeEventListener("did-start-loading", handleStartLoading);
      webview.removeEventListener("did-stop-loading", handleStopLoading);
      webview.removeEventListener("did-finish-load", handleStopLoading);
      webview.removeEventListener("did-navigate", handleDidNavigate);
      webview.removeEventListener(
        "did-navigate-in-page",
        handleDidNavigateInPage
      );
      webview.removeEventListener("page-title-updated", notifyTitleChange);
      webview.removeEventListener("context-menu", handleWebViewContextMenu);
    };
  }, [paneId]);

  const handleUrlSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      let targetUrl = inputUrl.trim();
      if (targetUrl.length === 0) return;

      // Add protocol if missing
      if (!targetUrl.match(/^[a-z]+:\/\//i)) {
        const lowerTarget = targetUrl.toLowerCase();
        const host = lowerTarget.split("/")[0];
        const isLocalhost =
          host === "localhost" || host.startsWith("localhost:");
        const protocol = isLocalhost ? "http" : "https";
        targetUrl = `${protocol}://${targetUrl}`;
      }

      webviewRef.current?.loadURL(targetUrl);
      addUrlToHistory(targetUrl);
      setShowHistory(false);
    },
    [inputUrl, addUrlToHistory]
  );

  const handleUrlInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputUrl(value);
      setShowHistory(value.trim().length === 0);
    },
    []
  );

  const handleUrlInputBlur = useCallback(() => {
    // Reset to current URL if user didn't submit
    setInputUrl(currentUrl);
    // Delay hiding history to allow clicking on items
    setTimeout(() => setShowHistory(false), HISTORY_DROPDOWN_HIDE_DELAY);
  }, [currentUrl]);

  const handleUrlInputFocus = useCallback(() => {
    if (inputUrl.trim().length === 0) {
      setShowHistory(true);
    }
  }, [inputUrl]);

  const handleHistoryItemClick = useCallback(
    (historyUrl: string) => {
      setInputUrl(historyUrl);
      webviewRef.current?.loadURL(historyUrl);

      addUrlToHistory(historyUrl);
      setShowHistory(false);
    },
    [addUrlToHistory]
  );

  return (
    <div className="relative flex flex-col flex-1 w-full h-full min-w-0 min-h-0">

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
          onClick={isLoading ? () => webviewRef.current?.stop() : () => webviewRef.current?.reload()}
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
              className="flex-1 px-3 py-1 text-sm bg-surface rounded border border-white/10 text-white placeholder-white/40 focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/30 overflow-hidden text-ellipsis"
              placeholder="Enter URL..."
            />
          </form>
          {showHistory && urlHistory.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-white/10 rounded shadow-lg z-10 max-h-48 overflow-y-auto">
              {urlHistory.map((historyUrl, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleHistoryItemClick(historyUrl)}
                  className="w-full px-3 py-2 text-sm text-left text-white hover:bg-white/10 transition border-b border-white/5 last:border-b-0 overflow-hidden text-ellipsis whitespace-nowrap"
                >
                  {historyUrl}
                </button>
              ))}
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
          ref={handleContainerRef}
          className="absolute inset-0 bg-white/[0.02] pointer-events-none"
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
