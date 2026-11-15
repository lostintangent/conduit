import { app, type WebContents } from "electron";
import type { BrowserNavigation } from "@shared/types/panes";
import { parseRestoreAddress } from "../model";

type Restore = { navigation: BrowserNavigation; url: string };

/** The history of the pages reopening with their workspace, by pane */
let staged = new Map<string, BrowserNavigation>();

/**
 * Sets aside the back/forward history of the pages a workspace reopens,
 * which they get back as their webviews attach, in place of any set aside
 * before.
 */
export function restoreOnAttach(pages: Map<string, BrowserNavigation>) {
  staged = pages;
}

/**
 * Gives each reopening page its history back, with its scroll position and
 * form values. Web contents only take a history before they load anything, so
 * a reopening page's webview starts at an address that names its pane, which
 * is dropped before it loads.
 */
export function restorePages(window: WebContents) {
  let attaching: Restore | undefined;
  const restoring = new WeakMap<WebContents, Restore>();

  window.on("will-attach-webview", (_event, _webPreferences, params) => {
    const page = parseRestoreAddress(params.src);
    if (!page) return;
    const navigation = staged.get(page.paneId);
    staged.delete(page.paneId);
    if (navigation) {
      delete params.src;
      attaching = { navigation, url: page.url };
    } else {
      params.src = page.url;
    }
  });

  // Electron creates the page's web contents as soon as the window may attach it
  app.on("web-contents-created", (_event, contents) => {
    if (attaching && contents.getType() === "webview") {
      restoring.set(contents, attaching);
    }
    attaching = undefined;
  });

  window.on("did-attach-webview", (_event, contents) => {
    const page = restoring.get(contents);
    if (page) restore(contents, page);
  });
}

function restore(contents: WebContents, { navigation, url }: Restore) {
  // A page that can't load keeps its history, with its error page. Only one
  // whose history didn't take loads its address instead.
  const loadInstead = (error: unknown) => {
    if (contents.isDestroyed() || contents.getURL()) return;
    console.error(`[Browser] Couldn't restore ${url}'s history:`, error);
    if (url) void contents.loadURL(url);
  };
  try {
    contents.navigationHistory.restore(navigation).catch(loadInstead);
  } catch (error) {
    loadInstead(error);
  }
}
