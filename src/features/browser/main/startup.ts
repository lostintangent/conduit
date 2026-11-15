import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  type Session,
  session,
  type WebContents,
} from "electron";
import { emitter, getAppWindow } from "../../../main/events";

const emit = emitter("browser");

// Pages browse in a session of their own, apart from Conduit's window, which
// keeps their cookies and storage across launches
const PARTITION = "persist:browser";

// What a page may do without asking. Conduit has no way to ask the user yet,
// so a page is told no to the rest, like the camera or notifications.
const ALLOWED_PERMISSIONS = new Set([
  "clipboard-sanitized-write",
  "fullscreen",
  "openExternal",
  "pointerLock",
  "screen-wake-lock",
]);

// Electron has no popup blocker, so a page may only open a window right after
// the user clicks or types in it. Safari allows about a second.
const ACTIVATION_MS = 1000;
const ACTIVATING_INPUT = new Set(["mouseDown", "mouseUp", "rawKeyDown"]);

// What a sign-in popup gets when it doesn't ask for a size
const POPUP_SIZE = { width: 500, height: 640 };

/**
 * Pages open links meant for a new tab in a pane next to theirs, and sized
 * popups, like "Sign in with…", in a window of their own.
 */
function handleWindowOpen(contents: WebContents) {
  let activatedAt = Number.NEGATIVE_INFINITY;
  contents.on("input-event", (_event, input) => {
    if (ACTIVATING_INPUT.has(input.type)) activatedAt = Date.now();
  });

  contents.setWindowOpenHandler(({ url, disposition, features }) => {
    if (Date.now() - activatedAt > ACTIVATION_MS) return { action: "deny" };
    // One window per click, as in browsers
    activatedAt = Number.NEGATIVE_INFINITY;

    // A shift-click asks for a new window without a size, which reads better
    // as a pane. A blank page is one the opener means to script, which needs
    // the window it gets back.
    const isPopup =
      (disposition === "new-window" && features !== "") ||
      url === "about:blank";
    if (!isPopup && contents.getType() === "webview") {
      emit("newPageRequested", {
        webContentsId: contents.id,
        url,
        background: disposition === "background-tab",
      });
      return { action: "deny" };
    }

    return {
      action: "allow",
      overrideBrowserWindowOptions: popupOptions(contents, features),
    };
  });
}

/** Centers the popup over the window it came from, which it stays above. */
function popupOptions(
  contents: WebContents,
  features: string,
): BrowserWindowConstructorOptions {
  const requested = Object.fromEntries(
    features
      .split(",")
      .map((feature) => feature.split("=").map((part) => part.trim())),
  );
  const width = Number.parseInt(requested.width) || POPUP_SIZE.width;
  const height = Number.parseInt(requested.height) || POPUP_SIZE.height;
  const parent = BrowserWindow.fromWebContents(
    contents.hostWebContents ?? contents,
  );
  // Like browsers, the size is the page's, not the window's with its title bar
  if (!parent) return { width, height, useContentSize: true };

  const bounds = parent.getBounds();
  return {
    width,
    height,
    useContentSize: true,
    x: Math.round(bounds.x + (bounds.width - width) / 2),
    y: Math.round(bounds.y + (bounds.height - height) / 2),
    parent,
  };
}

/**
 * Sites see Chrome rather than Conduit on Electron, which some, like Google's
 * sign-in, refuse to work with. It's the app's fallback rather than the
 * session's, since popups don't take the session's.
 */
function identifyAsChrome() {
  app.userAgentFallback = app.userAgentFallback.replace(
    / (Conduit|Electron)\/\S+/g,
    "",
  );
}

/** Gives pages only the permissions they may have without asking. */
function limitPermissions(browserSession: Session) {
  browserSession.setPermissionRequestHandler(
    (_contents, permission, callback) => {
      callback(ALLOWED_PERMISSIONS.has(permission));
    },
  );
  browserSession.setPermissionCheckHandler((_contents, permission) =>
    ALLOWED_PERMISSIONS.has(permission),
  );
}

export default function startBrowserSession() {
  identifyAsChrome();
  limitPermissions(session.fromPartition(PARTITION));

  // A page's popups take its session, so they browse in this one too
  getAppWindow()?.webContents.on(
    "will-attach-webview",
    (_event, webPreferences) => {
      webPreferences.partition = PARTITION;
    },
  );

  // Startups run once Conduit's window exists, so every web contents created
  // from here on is a page or one of its popups
  app.on("web-contents-created", (_event, contents) => {
    handleWindowOpen(contents);
  });
}
