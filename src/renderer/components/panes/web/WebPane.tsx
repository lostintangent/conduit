import { paneFlashAtom } from "@/store/atoms";
import type {
  ContextMenuParams,
  DidNavigateEvent,
  DidNavigateInPageEvent,
  PageTitleUpdatedEvent,
  WebviewTag,
} from "electron";
import { useAtomValue } from "jotai";
import { ArrowLeft, ArrowRight, Loader2, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type WebPaneProps = {
  url: string;
  paneId: string;
  showBorder: boolean;
  borderStyle?: "solid" | "dashed";
  onTitleChange?: (title: string) => void;
  disableInteraction?: boolean;
  onContextMenu?: (coords: { clientX: number; clientY: number }) => void;
  isActive?: boolean;
};

export function WebPane({
  url,
  paneId,
  showBorder,
  borderStyle = "solid",
  onTitleChange,
  disableInteraction = false,
  onContextMenu,
  isActive = true,
}: WebPaneProps) {
  const webviewRef = useRef<WebviewTag | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentUrl, setCurrentUrl] = useState<string>(url);
  const [inputUrl, setInputUrl] = useState<string>(url);
  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [canGoForward, setCanGoForward] = useState<boolean>(false);
  const [flashClass, setFlashClass] = useState<string>("");
  const paneFlash = useAtomValue(paneFlashAtom);

  useEffect(() => {
    setCurrentUrl(url);
    setInputUrl(url);
  }, [url]);

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
      setCurrentUrl(event.url);
      setInputUrl(event.url);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    };

    const handleDidNavigateInPage = (event: DidNavigateInPageEvent) => {
      setCurrentUrl(event.url);
      setInputUrl(event.url);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
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
  }, [onTitleChange, onContextMenu]);

  const handleGoBack = useCallback(() => {
    webviewRef.current?.goBack();
  }, []);

  const handleGoForward = useCallback(() => {
    webviewRef.current?.goForward();
  }, []);

  const handleRefresh = useCallback(() => {
    webviewRef.current?.reload();
  }, []);

  const handleStopLoading = useCallback(() => {
    webviewRef.current?.stop();
  }, []);

  const handleUrlSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      let targetUrl = inputUrl.trim();
      if (targetUrl.length === 0) return;

      // Add protocol if missing
      if (!targetUrl.match(/^[a-z]+:\/\//i)) {
        targetUrl = `https://${targetUrl}`;
      }

      webviewRef.current?.loadURL(targetUrl);
    },
    [inputUrl]
  );

  const handleUrlInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputUrl(e.target.value);
    },
    []
  );

  const handleUrlInputBlur = useCallback(() => {
    // Reset to current URL if user didn't submit
    setInputUrl(currentUrl);
  }, [currentUrl]);

  // Handle flash effect
  useEffect(() => {
    if (!paneFlash || paneFlash.paneId !== paneId) {
      // Clear flash class when this is no longer the flashing pane
      if (flashClass) {
        setFlashClass("");
      }
      return;
    }

    const className =
      paneFlash.type === "origin" ? "pane-flash-origin" : "pane-flash-target";
    setFlashClass(className);

    // Clear the flash class after animation completes
    const duration = paneFlash.type === "origin" ? 300 : 600;
    const timeout = setTimeout(() => {
      setFlashClass("");
    }, duration);

    return () => clearTimeout(timeout);
  }, [paneFlash, paneId, flashClass]);

  return (
    <div
      className={`relative flex flex-col flex-1 w-full h-full min-w-0 min-h-0 ${isActive && showBorder ? (borderStyle === "dashed" ? "pane-active-border-dashed" : "pane-active-border") : ""} ${flashClass}`}
    >
      {/* URL Bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-surface-elevated border-b border-white/10">
        <button
          type="button"
          onClick={handleGoBack}
          disabled={!canGoBack}
          className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
          title="Back"
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <button
          type="button"
          onClick={handleGoForward}
          disabled={!canGoForward}
          className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
          title="Forward"
        >
          <ArrowRight className="w-4 h-4 text-white" />
        </button>
        <button
          type="button"
          onClick={isLoading ? handleStopLoading : handleRefresh}
          className="p-1.5 rounded hover:bg-white/10 transition"
          title={isLoading ? "Stop" : "Refresh"}
        >
          {isLoading ? (
            <X className="w-4 h-4 text-white" />
          ) : (
            <RefreshCw className="w-4 h-4 text-white" />
          )}
        </button>
        <form onSubmit={handleUrlSubmit} className="flex-1 flex min-w-0">
          <input
            type="text"
            value={inputUrl}
            onChange={handleUrlInputChange}
            onBlur={handleUrlInputBlur}
            className="flex-1 px-3 py-1 text-sm bg-surface rounded border border-white/10 text-white placeholder-white/40 focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/30 overflow-hidden text-ellipsis"
            placeholder="Enter URL..."
          />
        </form>
      </div>

      {/* WebView */}
      <div className="relative flex flex-1 w-full h-full min-w-0 min-h-0">
        <webview
          ref={webviewRef}
          className="flex-1 w-full h-full min-w-0 min-h-0 border-0 bg-white/[0.02]"
          style={disableInteraction ? { pointerEvents: "none" } : undefined}
          src={url}
        />
        {isLoading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
            <Loader2 className="h-8 w-8 text-white/80 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
