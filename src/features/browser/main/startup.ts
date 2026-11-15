import fs from "node:fs";
import path from "node:path";
import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  type Session,
  session,
  type WebContents,
} from "electron";
import { settings } from "@features/settings/main/settings";
import { emitter, getAppWindow } from "../../../main/events";
import type { Download } from "../model";
import { library, moveFromSettings } from "./library";
import { restorePages } from "./restore";

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

// Chromium saves cookies to disk every 30 seconds, so a crash could sign the
// user out of a site they just signed into. Conduit saves them sooner.
const COOKIE_SAVE_DELAY_MS = 1000;

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

/**
 * Saves a page's downloads straight to Downloads, as browsers do, and tells
 * Conduit's window how each one is going.
 */
function saveDownloads(browserSession: Session) {
  // Names taken by downloads still arriving, whose files don't exist yet
  const arriving = new Set<string>();
  let nextId = 0;

  browserSession.on("will-download", (_event, item) => {
    const savePath = availablePath(
      app.getPath("downloads"),
      item.getFilename(),
      arriving,
    );
    arriving.add(savePath);
    item.setSavePath(savePath);

    const id = nextId++;
    const update = (state: Download["state"]) => {
      const total = item.getTotalBytes();
      emit("downloadUpdated", {
        id,
        name: path.basename(savePath),
        path: savePath,
        state,
        progress: total > 0 ? item.getReceivedBytes() / total : undefined,
      });
    };
    let finished = false;
    const finish = (state: Download["state"]) => {
      if (finished) return;
      finished = true;
      arriving.delete(savePath);
      update(state);
    };

    update("progressing");
    item.on("updated", (_event, state) => {
      if (state === "progressing") update(state);
      else if (state === "interrupted") {
        // Chromium has stopped retrying, and Conduit can't resume, so
        // fail and discard the partial file rather than wait for "done"
        finish("failed");
        item.cancel();
      }
    });
    item.once("done", (_event, state) => {
      finish(state === "interrupted" ? "failed" : state);
    });
  });
}

/** Saves cookies a moment after they change, once for a burst of changes. */
function saveCookiesSoon(browserSession: Session) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  browserSession.cookies.on("changed", () => {
    timer ??= setTimeout(() => {
      timer = undefined;
      void browserSession.cookies.flushStore();
    }, COOKIE_SAVE_DELAY_MS);
  });
}

/** Puts the pages the user goes to in history, with their titles. */
function recordHistory(contents: WebContents) {
  const page = () => ({ url: contents.getURL(), title: contents.getTitle() });
  const changed = (recorded: boolean) => {
    if (recorded) emit("libraryChanged", library.get());
  };

  // Chromium sends no did-navigate for an error page, so a page that didn't
  // load isn't recorded
  contents.on("did-navigate", () => changed(library.visit(page())));
  contents.on("did-navigate-in-page", (_event, _url, isMainFrame) => {
    if (isMainFrame) changed(library.visit(page()));
  });
  contents.on("page-title-updated", () => changed(library.retitle(page())));
}

/**
 * Where to save a file with this name in the folder, numbering it like
 * "report 2.csv" when the name is taken.
 */
function availablePath(folder: string, name: string, taken: Set<string>) {
  const extension = /(?:\.tar)?\.[^.]+$/.exec(name.slice(1))?.[0] ?? "";
  const stem = name.slice(0, name.length - extension.length);
  for (let copy = 1; ; copy++) {
    const candidate = path.join(
      folder,
      copy === 1 ? name : `${stem} ${copy}${extension}`,
    );
    if (!taken.has(candidate) && !fs.existsSync(candidate)) return candidate;
  }
}

export default async function startBrowserSession() {
  identifyAsChrome();
  const browserSession = session.fromPartition(PARTITION);
  limitPermissions(browserSession);
  saveDownloads(browserSession);
  saveCookiesSoon(browserSession);

  const appWindow = getAppWindow()?.webContents;
  // A page's popups take its session, so they browse in this one too
  appWindow?.on("will-attach-webview", (_event, webPreferences) => {
    webPreferences.partition = PARTITION;
  });
  if (appWindow) restorePages(appWindow);

  // Startups run once Conduit's window exists, so every web contents created
  // from here on is a page or one of its popups
  app.on("web-contents-created", (_event, contents) => {
    handleWindowOpen(contents);
    if (contents.getType() === "webview") recordHistory(contents);
  });

  await moveFromSettings(library, settings).catch((error) =>
    console.error("[Browser] Couldn't move history out of settings:", error),
  );
  return () => library.flush();
}
