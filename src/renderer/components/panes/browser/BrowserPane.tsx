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
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrowserToolbar } from "./toolbar/BrowserToolbar";

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
  const applicationMode = useAtomValue(applicationModeAtom);

  const webviewRef = useRef<WebviewTag | null>(null);
  const webviewAnchorRef = useRef<HTMLDivElement | null>(null);

  const previewOverlayRef = useRef<HTMLDivElement | null>(null);
  const isPreviewHoveredRef = useRef(false);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentUrl, setCurrentUrl] = useState<string>(url);
  const [pageTitle, setPageTitle] = useState<string>("");

  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [canGoForward, setCanGoForward] = useState<boolean>(false);

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
          "pointer-events-none bg-accent/30 backdrop-blur-[0.5px]";
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

  return (
    <div className="relative flex flex-col flex-1 w-full h-full min-w-0 min-h-0 bg-background">
      <BrowserToolbar
        currentPage={{ url: currentUrl, title: pageTitle }}
        isLoading={isLoading}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onNavigate={(url) => webviewRef.current?.loadURL(url)}
        onGoBack={() => webviewRef.current?.goBack()}
        onGoForward={() => webviewRef.current?.goForward()}
        onRefresh={() => webviewRef.current?.reload()}
        onStop={() => webviewRef.current?.stop()}
        onOpenDevTools={() => webviewRef.current?.openDevTools()}
        onCaptureScreenshot={() => {
          const webContentsId = webviewRef.current?.getWebContentsId();
          if (webContentsId) {
            api.captureScreenshot(webContentsId);
          }
        }}
      />

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
