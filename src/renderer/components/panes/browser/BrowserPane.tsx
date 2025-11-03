import { useUserSettings } from "@/hooks/useUserSettings";
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
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Loader2,
  RefreshCw,
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
  const { urlHistory, addUrlToHistory } = useUserSettings();

  const webviewRef = useRef<WebviewTag | null>(null);
  const webviewAnchorRef = useRef<HTMLDivElement | null>(null);

  const previewOverlayRef = useRef<HTMLDivElement | null>(null);
  const isPreviewHoveredRef = useRef(false);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentUrl, setCurrentUrl] = useState<string>(url);
  const [inputUrl, setInputUrl] = useState<string>(url);

  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [canGoForward, setCanGoForward] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);

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

      document.body.appendChild(webview);

      setIsLoading(true);
    } else {
      // Attach to existing webview
      setIsLoading(webview.isLoading ? webview.isLoading() : false);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
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

      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());

      onUrlChange(url);
    };

    const notifyTitleChange = ({ title }: PageTitleUpdatedEvent) =>
      onTitleChange(title);

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
    setShowHistory(false);

    webviewRef.current?.loadURL(targetUrl);
  }, [inputUrl, addUrlToHistory]);

  const handleUrlInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputUrl(value);

      // If the user cleared the input bar, then
      // show the MRU history dropdown (if we have any).
      setShowHistory(value.trim().length === 0 && urlHistory.length > 0);
    },
    [],
  );

  const handleUrlInputBlur = useCallback(() => {
    // Reset the input URL to the current URL after a short delay
    setInputUrl(currentUrl);
    setShowHistory(false);
  }, [currentUrl]);

  const handleUrlInputFocus = useCallback(() => {
    if (inputUrl.trim().length === 0 && urlHistory.length > 0) {
      setShowHistory(true);
    }
  }, [inputUrl, urlHistory]);

  const handleHistoryItemClick = useCallback(
    (historyUrl: string) => {
      setInputUrl(historyUrl);
      webviewRef.current?.loadURL(historyUrl);

      addUrlToHistory(historyUrl);
      setShowHistory(false);
    },
    [addUrlToHistory],
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
          ref={webviewAnchorRef}
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
