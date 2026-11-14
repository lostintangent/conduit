import { useFocusWhenActive } from "@/hooks/useFocusWhenActive";
import { activatePane } from "@/store/actions/pane";
import { applicationModeAtom } from "@/store/atoms";
import {
  applyWebviewScaling,
  calculateWebviewScale,
} from "@/utils/preview-scaling";
import type {
  ContextMenuParams,
  DidNavigateEvent,
  DidNavigateInPageEvent,
  IpcMessageEvent,
  PageTitleUpdatedEvent,
  WebviewTag,
} from "electron";
import { useSelector } from "@tanstack/react-store";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { shareAppKeys } from "./appKeys";
import { BrowserToolbar } from "./toolbar/BrowserToolbar";
import type { ConsoleMessage } from "./toolbar/ConsoleErrors";

const { browser } = window.conduit;

/**
 * Z-index values for webview positioning in different contexts.
 * These ensure proper layering with overlays and other UI elements.
 */
const WEBVIEW_Z_INDEX = {
  /** Preview mode: highest priority, above all overlays */
  PREVIEW: "10001",
  /** Sidebar mode: above sidebar panel (z-40) but below preview */
  SIDEBAR: "50",
  /** Normal tab mode: lowest, below design mode overlays (z-30) */
  NORMAL: "1",
} as const;

type BrowserPaneProps = {
  url: string;
  paneId: string;
  tabId?: string;

  onUrlChange: (url: string) => void;
  onTitleChange: (title: string) => void;

  // TODO: See if we can remove the X/Y coordinates and let Electron handle it internally
  onContextMenu: (coords: { clientX: number; clientY: number }) => void;
  onHover: (isHovering: boolean) => void;

  disableInteraction: boolean;
  isInPreview: boolean;
  /** Whether this is the active pane of the active tab */
  isActive?: boolean;
  devToolsFor?: string;
  chromeless?: boolean;
  isDevToolsOpen: boolean;
  onToggleDevTools: () => void;
  onHideToolbar: () => void;
};

export function BrowserPane({
  url,
  paneId,
  tabId,
  onTitleChange,
  onUrlChange,
  onContextMenu,
  onHover,
  disableInteraction = false,
  isInPreview = false,
  isActive = false,
  devToolsFor,
  chromeless,
  isDevToolsOpen,
  onToggleDevTools,
  onHideToolbar,
}: BrowserPaneProps) {
  const applicationMode = useSelector(applicationModeAtom);

  const paneRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<WebviewTag | null>(null);
  const webviewAnchorRef = useRef<HTMLDivElement | null>(null);

  const previewOverlayRef = useRef<HTMLDivElement | null>(null);
  const isPreviewHoveredRef = useRef(false);

  // Refs for callbacks to avoid stale closures in event listeners
  const onUrlChangeRef = useRef(onUrlChange);
  onUrlChangeRef.current = onUrlChange;
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentUrl, setCurrentUrl] = useState<string>(url);
  const [pageTitle, setPageTitle] = useState<string>("");

  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [canGoForward, setCanGoForward] = useState<boolean>(false);

  const [consoleErrors, setConsoleErrors] = useState<ConsoleMessage[]>([]);
  const [isDomReady, setIsDomReady] = useState<boolean>(false);

  // After the component is mounted, we need to create or attach
  // to the <wevbview> element for this pane. A tab's panes stay mounted as it
  // moves in and out of a preview, so this runs again when that changes.
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
      setIsDomReady(false);
    } else {
      // Attach to existing webview - it's already initialized
      setIsDomReady(true);
      setIsLoading(webview.isLoading ? webview.isLoading() : false);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());

      const initialTitle = webview.getTitle() ?? "";
      setPageTitle(initialTitle);
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

    // Sidebar and preview modes need continuous RAF-based position tracking
    // to follow animations. Tab panes only need event-driven updates.
    const needsRAFLoop = isInPreview || !tabId;
    // Ends this run's RAF loop, which would otherwise outlive it when the
    // effect runs again for the same webview
    let isDisposed = false;

    const updatePosition = () => {
      const anchor = webviewAnchorRef.current;
      const currentWebview = webviewRef.current;
      if (isDisposed || !anchor || !currentWebview) {
        return;
      }

      ensurePreviewOverlay();

      // Set z-index based on context
      const zIndex = isInPreview
        ? WEBVIEW_Z_INDEX.PREVIEW
        : !tabId
          ? WEBVIEW_Z_INDEX.SIDEBAR
          : WEBVIEW_Z_INDEX.NORMAL;
      currentWebview.style.zIndex = zIndex;

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

      // Continue the RAF loop only if on-screen to avoid wasting cycles
      // when hidden (e.g., sidebar closed). The IntersectionObserver below
      // restarts the loop when the element becomes visible again.
      if (needsRAFLoop) {
        const isOnScreen = rect.right > 0 && rect.left < window.innerWidth;
        if (isOnScreen) {
          requestAnimationFrame(updatePosition);
        }
      }
    };

    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(webviewAnchorRef.current);

    // IntersectionObserver restarts the RAF loop when the element becomes
    // visible (e.g., sidebar slides open). Without this, the off-screen
    // optimization above would leave the webview stuck.
    const intersectionObserver = needsRAFLoop
      ? new IntersectionObserver((entries) => {
          if (entries[0]?.isIntersecting) {
            updatePosition();
          }
        })
      : null;
    intersectionObserver?.observe(webviewAnchorRef.current);

    updatePosition();

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      isDisposed = true;
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);

      resizeObserver.disconnect();
      intersectionObserver?.disconnect();

      if (previewOverlayRef.current) {
        previewOverlayRef.current.remove();
        previewOverlayRef.current = null;
      }

      if (webviewRef.current === webview) {
        webview.style.zIndex = "1";
        webview.style.transform = "";
        webview.style.transformOrigin = "";
        webview.style.left = "-10000px";
        // Off screen, its page would keep the keyboard, and the app's keys
        // it hands over would have no pane to run them
        if (document.activeElement === webview) webview.blur();
        webviewRef.current = null;
      }
    };
  }, [webviewAnchorRef, isInPreview, tabId]);

  // Once we have a new or existing webview, we need to hook
  // up the event listeners to it (e.g. navigation, title change, etc)
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    if (devToolsFor) {
      setTimeout(() => {
        const sourceWebview = document.getElementById(
          devToolsFor,
        ) as WebviewTag | null;
        if (!sourceWebview) return;

        const sourceWebContentsId = sourceWebview.getWebContentsId();
        const devToolsWebContentsId = webview.getWebContentsId();

        if (sourceWebContentsId && devToolsWebContentsId) {
          browser.showDevTools(sourceWebContentsId, devToolsWebContentsId);
        }
      }, 100);
    }

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

      setConsoleErrors([]);
      onUrlChangeRef.current(url);
    };

    const notifyTitleChange = ({ title }: PageTitleUpdatedEvent) => {
      const normalizedTitle = typeof title === "string" ? title.trim() : "";
      setPageTitle(normalizedTitle);
      onTitleChangeRef.current(title);
    };

    const handleWebViewContextMenu = (
      event: Event & { params: ContextMenuParams },
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

    const handleWebViewFocus = () => {
      // Only activate pane when in tab mode (not sidebar mode)
      if (tabId) {
        activatePane(tabId, paneId);
      }
    };

    // The webview's focus event misses clicks inside its page, so the page
    // reports them itself
    const handleIpcMessage = ({ channel }: IpcMessageEvent) => {
      if (channel === "browser:pointerdown") handleWebViewFocus();
    };

    const handleConsoleMessage = (
      event: Event & {
        message?: string;
        level?: number;
        sourceId?: string;
        line?: number;
      },
    ) => {
      const { message, level, sourceId, line } = event;

      // Only capture errors (level 2) from HTTP/HTTPS sources
      if (level !== 2) return;

      const source = (sourceId ?? "").toLowerCase();
      if (!source.startsWith("http://") && !source.startsWith("https://")) {
        return;
      }

      setConsoleErrors((prev) => [
        ...prev,
        {
          message: message ?? "",
          level: level ?? 0,
          sourceId: sourceId ?? "",
          line: line ?? 0,
          timestamp: Date.now(),
        },
      ]);
    };

    const handleDomReady = () => setIsDomReady(true);

    webview.addEventListener("dom-ready", handleDomReady);
    webview.addEventListener("did-start-loading", handleStartLoading);
    webview.addEventListener("did-stop-loading", handleStopLoading);
    webview.addEventListener("did-finish-load", handleStopLoading);

    webview.addEventListener("did-navigate", handleDidNavigate);
    webview.addEventListener("did-navigate-in-page", handleDidNavigate);

    webview.addEventListener("page-title-updated", notifyTitleChange);
    webview.addEventListener("context-menu", handleWebViewContextMenu);

    webview.addEventListener("mouseenter", handleWebViewMouseEnter);
    webview.addEventListener("mouseleave", handleWebViewMouseLeave);

    webview.addEventListener("focus", handleWebViewFocus);
    webview.addEventListener("ipc-message", handleIpcMessage);

    webview.addEventListener("console-message", handleConsoleMessage);

    const stopSharingAppKeys = shareAppKeys(webview);

    return () => {
      stopSharingAppKeys();

      webview.removeEventListener("dom-ready", handleDomReady);
      webview.removeEventListener("did-start-loading", handleStartLoading);
      webview.removeEventListener("did-stop-loading", handleStopLoading);
      webview.removeEventListener("did-finish-load", handleStopLoading);

      webview.removeEventListener("did-navigate", handleDidNavigate);
      webview.removeEventListener("did-navigate-in-page", handleDidNavigate);

      webview.removeEventListener("page-title-updated", notifyTitleChange);
      webview.removeEventListener("context-menu", handleWebViewContextMenu);

      webview.removeEventListener("mouseenter", handleWebViewMouseEnter);
      webview.removeEventListener("mouseleave", handleWebViewMouseLeave);

      webview.removeEventListener("focus", handleWebViewFocus);
      webview.removeEventListener("ipc-message", handleIpcMessage);

      webview.removeEventListener("console-message", handleConsoleMessage);
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

  // Respond to URL prop changes (e.g., when sidebar browser receives a new URL)
  // Skip about:blank as that's the initial/empty state
  useEffect(() => {
    if (!webviewRef.current || !url || url === "about:blank") return;

    // Guard webview API calls until dom-ready has fired to avoid Electron errors
    if (!isDomReady) return;

    // Only load if the URL is different from current
    const currentWebviewUrl = webviewRef.current.getURL?.() || "";
    if (url !== currentWebviewUrl) {
      webviewRef.current.loadURL(url);
    }
  }, [url, isDomReady]);

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

  // Focus the pane rather than the page: keys typed in a webview never reach
  // the app's keybindings, so focusing it would trap keyboard users. The
  // webview lives on document.body, outside this pane's DOM.
  useFocusWhenActive(isActive, paneRef, () => {
    if (document.activeElement === webviewRef.current) return;
    paneRef.current?.focus({ preventScroll: true });
  });

  return (
    <div
      ref={paneRef}
      tabIndex={-1}
      className="relative flex flex-col flex-1 w-full h-full min-w-0 min-h-0 bg-background outline-none"
    >
      {!(chromeless || devToolsFor) && (
        <BrowserToolbar
          currentPage={{ url: currentUrl, title: pageTitle }}
          isLoading={isLoading}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          consoleErrors={consoleErrors}
          onClearConsoleErrors={() => setConsoleErrors([])}
          onRemoveConsoleError={(index) =>
            setConsoleErrors((prev) => prev.filter((_, i) => i !== index))
          }
          onNavigate={(url) => webviewRef.current?.loadURL(url)}
          onGoBack={() => webviewRef.current?.goBack()}
          onGoForward={() => webviewRef.current?.goForward()}
          onRefresh={() => webviewRef.current?.reload()}
          onStop={() => webviewRef.current?.stop()}
          isDevToolsOpen={isDevToolsOpen}
          onToggleDevTools={onToggleDevTools}
          onHideToolbar={onHideToolbar}
          onCaptureScreenshot={async () => {
            const webContentsId = webviewRef.current?.getWebContentsId();
            if (webContentsId === undefined) return;
            await browser.captureScreenshot(webContentsId);
          }}
          tabId={tabId}
        />
      )}

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
