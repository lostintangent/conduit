import { useFocusWhenActive } from "@/hooks/useFocusWhenActive";
import { registerBrowserPaneHandlers } from "@features/browser/client/paneHandlers";
import {
  getWebview,
  loadFailures,
  loadPage,
  takePageFocus,
  takePageRestore,
} from "@features/browser/client/webview";
import { restoreAddress } from "@features/browser/model";
import { activatePane } from "@features/workbench/client/actions/pane";
import { applicationModeAtom } from "@features/workbench/client/atoms";
import {
  applyWebviewScaling,
  calculateWebviewScale,
} from "@features/browser/client/previewScaling";
import type {
  ContextMenuParams,
  DidFailLoadEvent,
  DidNavigateEvent,
  DidNavigateInPageEvent,
  IpcMessageEvent,
  PageTitleUpdatedEvent,
  WebviewTag,
} from "electron";
import { useSelector } from "@tanstack/react-store";
import { Loader2 } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { shareAppKeys } from "./appKeys";
import { ErrorPage } from "./ErrorPage";
import { FindBar, type FindBarHandle } from "./FindBar";
import {
  BrowserToolbar,
  type BrowserToolbarHandle,
} from "./toolbar/BrowserToolbar";
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

/**
 * Find floats on the body over its page, so it sits just above it. In the
 * sidebar it's level with the page, and draws over it by coming later.
 */
const FIND_BAR_Z_INDEX = { SIDEBAR: 50, NORMAL: 2 } as const;

type BrowserPaneProps = {
  /** Where a new webview starts. Changing it later doesn't navigate the page. */
  url: string;
  paneId: string;
  tabId?: string;

  onUrlChange: (url: string) => void;
  onTitleChange: (title: string) => void;
  /** Reports the page's web contents, which main saves its history from. */
  onAttach?: (webContentsId: number) => void;
  /** Opens a link the page meant for a new tab. Without it, the page loads it. */
  onOpenPage?: (url: string, background: boolean) => void;

  /** The page was right-clicked, on what `params` describes */
  onContextMenu: (params: ContextMenuParams) => void;
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

/**
 * Webviews whose page has attached, which only then takes the keys. Its web
 * contents can come a moment before that, so they can't tell.
 */
const attachedWebviews = new WeakSet<WebviewTag>();

/** The page's web contents, which a webview only has once Electron creates it */
function getWebContentsId(webview: WebviewTag): number | undefined {
  try {
    return webview.getWebContentsId();
  } catch {
    return undefined;
  }
}

export function BrowserPane({
  url,
  paneId,
  tabId,
  onTitleChange,
  onUrlChange,
  onAttach,
  onOpenPage,
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
  const showContextMenu = useEffectEvent(onContextMenu);
  const reportAttach = useEffectEvent((webContentsId: number) => {
    onAttach?.(webContentsId);
  });
  // Without anywhere to open a new tab, the page loads it in place
  const openPage = useEffectEvent((url: string, background: boolean) => {
    if (onOpenPage) onOpenPage(url, background);
    else if (webviewRef.current) loadPage(webviewRef.current, url);
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentUrl, setCurrentUrl] = useState<string>(url);
  // The address the user went to shows until its page is there, since the
  // page it's leaving stays current until then, or until it stops loading
  // without one, like a download
  const [goingTo, setGoingTo] = useState<string>();
  const [pageTitle, setPageTitle] = useState<string>("");
  // A page that didn't load still says why when its pane comes back to it
  const [loadFailure, setLoadFailure] = useState(() => {
    const webview = getWebview(paneId);
    const failure = webview && loadFailures.get(webview);
    return failure && failure.url === webview.getURL() ? failure : undefined;
  });

  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [canGoForward, setCanGoForward] = useState<boolean>(false);

  const toolbarRef = useRef<BrowserToolbarHandle | null>(null);
  const findBarRef = useRef<FindBarHandle | null>(null);
  // Cmd+L shows a hidden toolbar until focus leaves it
  const [isToolbarRevealed, setIsToolbarRevealed] = useState(false);

  const [consoleErrors, setConsoleErrors] = useState<ConsoleMessage[]>([]);

  // After the component is mounted, we need to create or attach
  // to the <wevbview> element for this pane. A tab's panes stay mounted as it
  // moves in and out of a preview, so this runs again when that changes.
  useEffect(() => {
    if (!webviewAnchorRef.current) return;

    let webview = getWebview(paneId);
    if (!webview) {
      // Create a new webview
      webview = document.createElement("webview") as WebviewTag;
      // Main decides what each popup becomes, see the browser's startup
      webview.setAttribute("allowpopups", "");
      // A page that reopens with its workspace gets its history back instead
      webview.src = takePageRestore(paneId) ? restoreAddress(paneId, url) : url;
      webview.id = paneId;
      webview.style.position = "absolute";
      webview.style.overflow = "hidden";

      document.body.appendChild(webview);
      setIsLoading(true);
      setCurrentUrl(url);
    } else {
      // Attach to existing webview - it's already initialized, and its page
      // may have moved on from the url prop while the pane was away
      setCurrentUrl(webview.getURL());
      setIsLoading(webview.isLoading ? webview.isLoading() : false);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());

      const initialTitle = webview.getTitle() ?? "";
      setPageTitle(initialTitle);
    }

    webviewRef.current = webview;

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

  // A page the user just opened can only take the keys once it attaches,
  // see handleDidAttach
  const isPageFocusPendingRef = useRef(false);

  // Focus goes to a page the user just opened, back to the page if it had
  // focus last, see handleWebViewFocus, and to the pane otherwise. The
  // webview lives on document.body, outside this pane's DOM.
  const focusedOutside = useFocusWhenActive(isActive, paneRef, () => {
    const webview = webviewRef.current;
    if (document.activeElement === webview) return;
    // A page that has the keys, like the one that opened this page, only
    // lets go of them when the window takes focus back first
    paneRef.current?.focus({ preventScroll: true });
    if (webview && takePageFocus(paneId)) {
      if (!attachedWebviews.has(webview)) {
        isPageFocusPendingRef.current = true;
        return;
      }
      webview.focus();
      return webview;
    }
  });

  // The pane says why its page didn't load in the page's place
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !loadFailure) return;

    webview.style.visibility = "hidden";
    return () => {
      webview.style.visibility = "";
      // Focus that left with the message goes to the page in its place
      if (
        webviewRef.current === webview &&
        document.activeElement === document.body
      ) {
        webview.focus();
        focusedOutside(webview);
      }
    };
  }, [loadFailure, isInPreview, tabId, focusedOutside]);

  // A dev tools pane has no toolbar, so Cmd+L opens a page from it instead
  useEffect(() => {
    if (devToolsFor) return;
    return registerBrowserPaneHandlers(paneId, {
      focusAddressBar: () => {
        if (toolbarRef.current) toolbarRef.current.focusAddressBar();
        else setIsToolbarRevealed(true);
      },
      find: () => findBarRef.current?.open(),
      findNext: () => findBarRef.current?.step(true),
      findPrevious: () => findBarRef.current?.step(false),
    });
  }, [paneId, devToolsFor]);

  useEffect(() => {
    if (isToolbarRevealed) toolbarRef.current?.focusAddressBar();
  }, [isToolbarRevealed]);

  // The page takes the keys, or the message in its place while it didn't
  // load, which hands them to the page once it does
  const errorPageRef = useRef<HTMLDivElement>(null);
  const focusPage = () => {
    const webview = webviewRef.current;
    if (loadFailure) {
      errorPageRef.current?.focus();
    } else if (webview) {
      webview.focus();
      focusedOutside(webview);
    }
  };

  // Once we have a new or existing webview, we need to hook
  // up the event listeners to it (e.g. navigation, title change, etc)
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    if (devToolsFor) {
      setTimeout(() => {
        const sourceWebview = getWebview(devToolsFor);
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
      setGoingTo(undefined);

      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    };

    const handleStartLoading = () => setIsLoading(true);

    const handleDidNavigate = ({
      url,
    }: DidNavigateEvent | DidNavigateInPageEvent) => {
      setCurrentUrl(url);
      setGoingTo(undefined);
      const updatedTitle =
        typeof webview.getTitle === "function" ? webview.getTitle() : "";
      setPageTitle(typeof updatedTitle === "string" ? updatedTitle.trim() : "");

      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());

      loadFailures.delete(webview);
      setLoadFailure(undefined);
      setConsoleErrors([]);
      onUrlChangeRef.current(url);
    };

    // A stopped load leaves the page as it was, and a frame in the page that
    // didn't load leaves the page to say so
    const handleDidFailLoad = ({
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
    }: DidFailLoadEvent) => {
      if (!isMainFrame || errorCode === -3) return;

      const failure = {
        code: errorCode,
        name: errorDescription,
        url: validatedURL,
      };
      loadFailures.set(webview, failure);
      setLoadFailure(failure);
      setCurrentUrl(validatedURL);
      onUrlChangeRef.current(validatedURL);
    };

    // A frame in the page moving within itself leaves the page where it was
    const handleDidNavigateInPage = (event: DidNavigateInPageEvent) => {
      if (event.isMainFrame) handleDidNavigate(event);
    };

    const notifyTitleChange = ({ title }: PageTitleUpdatedEvent) => {
      const normalizedTitle = typeof title === "string" ? title.trim() : "";
      setPageTitle(normalizedTitle);
      onTitleChangeRef.current(title);
    };

    const handleWebViewContextMenu = (
      event: Event & { params: ContextMenuParams },
    ) => showContextMenu(event.params);

    const handleWebViewMouseEnter = () => {
      isPreviewHoveredRef.current = true;
      onHover(true);
    };

    const handleWebViewMouseLeave = () => {
      isPreviewHoveredRef.current = false;
      onHover(false);
    };

    const handleWebViewFocus = () => {
      focusedOutside(webview);
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

    // Main knows the page only by its web contents
    const stopOpeningPages = browser.on(
      "newPageRequested",
      ({ webContentsId, url, background }) => {
        if (webContentsId === getWebContentsId(webview)) {
          openPage(url, background);
        }
      },
    );

    // A click that lands before the window draws the page where it now is,
    // like as its tab shows, comes to the window instead. The window would
    // keep the keys, even taking them from the page, so the page takes focus
    // the way its own click gives it. Focusing the webview does nothing
    // while it's already the focused element, so it lets go first.
    const handleWebViewMouseDown = (event: MouseEvent) => {
      event.preventDefault();
      webview.blur();
      webview.focus();
      handleWebViewFocus();
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

    // Electron dispatches did-attach and replies with the page's id
    // separately, so the id can come a moment after it
    let idTimer: ReturnType<typeof setTimeout> | undefined;
    const reportId = (triesLeft = 100) => {
      const webContentsId = getWebContentsId(webview);
      if (webContentsId !== undefined) reportAttach(webContentsId);
      else if (triesLeft > 0) {
        idTimer = setTimeout(reportId, 20, triesLeft - 1);
      }
    };
    // Like when a remount cut short the wait for its id
    if (attachedWebviews.has(webview)) reportId();

    // A page the user just opened takes the keys once it can, unless the
    // user moved focus since
    const handleDidAttach = () => {
      attachedWebviews.add(webview);
      reportId();
      if (
        isPageFocusPendingRef.current &&
        document.activeElement === paneRef.current
      ) {
        webview.focus();
        focusedOutside(webview);
      }
      isPageFocusPendingRef.current = false;
    };

    webview.addEventListener("did-attach", handleDidAttach);
    webview.addEventListener("did-start-loading", handleStartLoading);
    webview.addEventListener("did-stop-loading", handleStopLoading);
    webview.addEventListener("did-finish-load", handleStopLoading);

    webview.addEventListener("did-navigate", handleDidNavigate);
    webview.addEventListener("did-navigate-in-page", handleDidNavigateInPage);
    webview.addEventListener("did-fail-load", handleDidFailLoad);

    webview.addEventListener("page-title-updated", notifyTitleChange);
    webview.addEventListener("context-menu", handleWebViewContextMenu);

    webview.addEventListener("mouseenter", handleWebViewMouseEnter);
    webview.addEventListener("mouseleave", handleWebViewMouseLeave);

    webview.addEventListener("focus", handleWebViewFocus);
    webview.addEventListener("mousedown", handleWebViewMouseDown);
    webview.addEventListener("ipc-message", handleIpcMessage);

    webview.addEventListener("console-message", handleConsoleMessage);

    const stopSharingAppKeys = shareAppKeys(webview);

    return () => {
      clearTimeout(idTimer);
      stopSharingAppKeys();
      stopOpeningPages();

      webview.removeEventListener("did-attach", handleDidAttach);
      webview.removeEventListener("did-start-loading", handleStartLoading);
      webview.removeEventListener("did-stop-loading", handleStopLoading);
      webview.removeEventListener("did-finish-load", handleStopLoading);

      webview.removeEventListener("did-navigate", handleDidNavigate);
      webview.removeEventListener(
        "did-navigate-in-page",
        handleDidNavigateInPage,
      );
      webview.removeEventListener("did-fail-load", handleDidFailLoad);

      webview.removeEventListener("page-title-updated", notifyTitleChange);
      webview.removeEventListener("context-menu", handleWebViewContextMenu);

      webview.removeEventListener("mouseenter", handleWebViewMouseEnter);
      webview.removeEventListener("mouseleave", handleWebViewMouseLeave);

      webview.removeEventListener("focus", handleWebViewFocus);
      webview.removeEventListener("mousedown", handleWebViewMouseDown);
      webview.removeEventListener("ipc-message", handleIpcMessage);

      webview.removeEventListener("console-message", handleConsoleMessage);
    };
  }, [webviewRef, focusedOutside]);

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
    <div
      ref={paneRef}
      tabIndex={-1}
      className="relative flex flex-col flex-1 w-full h-full min-w-0 min-h-0 bg-background outline-none"
    >
      {!devToolsFor && (!chromeless || isToolbarRevealed) && (
        <BrowserToolbar
          ref={toolbarRef}
          currentPage={{ url: goingTo ?? currentUrl, title: pageTitle }}
          isLoading={isLoading}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          consoleErrors={consoleErrors}
          onClearConsoleErrors={() => setConsoleErrors([])}
          onRemoveConsoleError={(index) =>
            setConsoleErrors((prev) => prev.filter((_, i) => i !== index))
          }
          onNavigate={(url) => {
            if (!webviewRef.current) return;
            loadPage(webviewRef.current, url);
            setGoingTo(url);
          }}
          onGoBack={() => webviewRef.current?.goBack()}
          onGoForward={() => webviewRef.current?.goForward()}
          onRefresh={() => webviewRef.current?.reload()}
          onStop={() => webviewRef.current?.stop()}
          isDevToolsOpen={isDevToolsOpen}
          onToggleDevTools={onToggleDevTools}
          onHideToolbar={() => {
            setIsToolbarRevealed(false);
            onHideToolbar();
          }}
          onCaptureScreenshot={async () => {
            const webContentsId = webviewRef.current?.getWebContentsId();
            if (webContentsId === undefined) return;
            await browser.captureScreenshot(webContentsId);
          }}
          tabId={tabId}
          isInPreview={isInPreview}
          onDismiss={focusPage}
          onFocusLeave={
            isToolbarRevealed ? () => setIsToolbarRevealed(false) : undefined
          }
        />
      )}

      {/* WebView */}
      <div className="relative flex flex-1 w-full h-full min-w-0 min-h-0">
        <div
          ref={webviewAnchorRef}
          className="absolute inset-0 pointer-events-none"
          aria-hidden
        />
        {!devToolsFor && (
          <FindBar
            ref={findBarRef}
            page={webviewRef}
            zIndex={tabId ? FIND_BAR_Z_INDEX.NORMAL : FIND_BAR_Z_INDEX.SIDEBAR}
            follow={!tabId}
            hidden={isInPreview}
            onFocus={focusedOutside}
            onFocusPage={focusPage}
          />
        )}
        {loadFailure && (
          <ErrorPage
            ref={errorPageRef}
            failure={loadFailure}
            onTryAgain={() => webviewRef.current?.reload()}
          />
        )}
        {isLoading && !loadFailure && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/20">
            <Loader2 className="h-8 w-8 text-white/80 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
