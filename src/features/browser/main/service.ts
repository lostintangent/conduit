import { ClipboardItem, clipboard, type WebContents } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BrowserPage } from "../model";
import { capturePage, getWebContents } from "./capture";
import { library } from "./library";

/** The DevTools a pane has loaded for each page, by the page's id */
const paneDevTools = new Map<number, WebContents>();
/** Where to inspect each page once a pane has loaded its DevTools */
const pendingInspections = new Map<number, { x: number; y: number }>();

/** Runs a script in a world of our own in the page, so its scripts can't see or upset ours */
const inOwnWorld = (page: WebContents, code: string): Promise<unknown> =>
  page.executeJavaScriptInIsolatedWorld(1001, [{ code }]).catch(() => {});

/**
 * Inspects the element a point was over before a DevTools pane reshaped the
 * page, wherever it is now, scrolling it back into view if the pane covered it.
 */
async function inspectAgain(page: WebContents, x: number, y: number) {
  const [movedX, movedY] = ((await inOwnWorld(
    page,
    `(() => {
      const { element, x, y, left, top } = globalThis.inspected ?? {};
      if (!element?.isConnected) return;
      let box = element.getBoundingClientRect();
      if (document.elementFromPoint(x + box.left - left, y + box.top - top) !== element) {
        element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
        box = element.getBoundingClientRect();
      }
      return [box.left - left, box.top - top];
    })()`,
  )) ?? [0, 0]) as [number, number];

  const zoom = page.getZoomFactor();
  page.inspectElement(
    Math.round(x + movedX * zoom),
    Math.round(y + movedY * zoom),
  );
}

/** How many of a page's icons to fetch, and how long and large each may be */
const ICON_LIMITS = { count: 8, timeoutMs: 5000, bytes: 512 * 1024 };

/** Whether the address is on the page's site, which is its origin */
const onPageSite = (page: WebContents, url: string) =>
  new URL(url).origin === new URL(page.getURL()).origin;

/**
 * Fetches an icon through its page's session, as the page would. Only an icon
 * on the page's own site goes with the site's cookies, since a page can name
 * any address as its icon. Skips one that didn't load or isn't an image, like
 * the page that says a site has no favicon.ico.
 */
async function fetchIcon(page: WebContents, url: string) {
  try {
    const response = await page.session.fetch(url, {
      credentials: onPageSite(page, url) ? "include" : "omit",
      signal: AbortSignal.timeout(ICON_LIMITS.timeoutMs),
    });
    const type = response.headers.get("content-type")?.split(";")[0].trim();
    if (!response.ok || !type?.startsWith("image/")) return;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > ICON_LIMITS.bytes) return;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return;
  }
}

const service = {
  getLibrary: () => library.get(),
  addFavorite: (page: BrowserPage) => library.addFavorite(page),
  removeFavorite: (url: string) => library.removeFavorite(url),
  removeFromHistory: (url: string) => library.removeFromHistory(url),
  clearHistory: () => library.clearHistory(),

  /**
   * The icons a page links to, as data URLs, which the app's own pages can
   * show. Main fetches them, since only the page's session has its cookies.
   */
  async fetchIcons(webContentsId: number, urls: string[]): Promise<string[]> {
    const page = getWebContents(webContentsId);
    const icons = await Promise.all(
      urls
        .filter((url) => /^https?:/.test(url))
        .slice(0, ICON_LIMITS.count)
        .map((url) => fetchIcon(page, url)),
    );
    return icons.filter((icon) => icon !== undefined);
  },

  /**
   * The icons a page links to now, by the rules its webview reports them by:
   * the links in its head whose last icon type is `icon`, for media that
   * matches, or else its site's favicon.ico.
   */
  async linkedIcons(webContentsId: number): Promise<string[]> {
    const icons = await inOwnWorld(
      getWebContents(webContentsId),
      `(() => {
        const isIcon = (link) =>
          link.rel.toLowerCase().split(/[\\t\\n\\f\\r ]+/)
            .findLast((type) => /^(icon|apple-touch-icon(-precomposed)?)$/.test(type)) === "icon";
        const icons = [...(document.head?.children ?? [])]
          .filter((link) =>
            link instanceof HTMLLinkElement && isIcon(link) &&
            link.getAttribute("href")?.trim() &&
            (!link.media || matchMedia(link.media).matches))
          .map((link) => link.href);
        return icons.length > 0 || !/^https?:$/.test(location.protocol)
          ? icons
          : [location.origin + "/favicon.ico"];
      })()`,
    );
    return Array.isArray(icons) ? icons : [];
  },

  /** Copies a screenshot of the page to the clipboard. */
  async captureScreenshot(webContentsId: number): Promise<void> {
    const image = await capturePage(getWebContents(webContentsId));
    // Copy the bytes because TypeScript doesn't accept a Node Buffer as a BlobPart.
    const png = new Blob([new Uint8Array(image.toPNG())], {
      type: "image/png",
    });
    await clipboard.write([new ClipboardItem({ "image/png": png })]);
  },

  /** Saves a screenshot of the page to a temporary PNG and returns its path. */
  async saveScreenshot(webContentsId: number): Promise<string> {
    const image = await capturePage(getWebContents(webContentsId));
    const file = path.join(tmpdir(), `capture-${randomUUID()}.png`);
    await fs.writeFile(file, image.toPNG());
    return file;
  },

  /** Copies the image at a point in the page, which a webview can't itself */
  copyImageAt(webContentsId: number, x: number, y: number) {
    getWebContents(webContentsId).copyImageAt(x, y);
  },

  /**
   * Selects the element at a point, in the window's coordinates, in the page's
   * DevTools pane, or once the pane that's opening has loaded them. Until then,
   * the page can drop it, or without a pane Electron would open DevTools in a
   * window of its own. A pane opening below reshapes the page, so this first
   * notes what's at the point in the page, and resolves once it's safe to open.
   */
  async inspectElement(
    webContentsId: number,
    x: number,
    y: number,
    inPage: { x: number; y: number },
  ) {
    const page = getWebContents(webContentsId);
    if (paneDevTools.has(webContentsId)) {
      page.inspectElement(x, y);
      return;
    }

    const [pageX, pageY] = [Number(inPage.x), Number(inPage.y)];
    await inOwnWorld(
      page,
      `(() => {
        const element = document.elementFromPoint(${pageX}, ${pageY});
        const { left, top } = element?.getBoundingClientRect() ?? {};
        globalThis.inspected = element && { element, x: ${pageX}, y: ${pageY}, left, top };
      })()`,
    );
    pendingInspections.set(webContentsId, { x, y });
  },

  /** Opens the page's DevTools inside the pane's own DevTools webview. */
  showDevTools(sourceWebContentsId: number, devToolsWebContentsId: number) {
    const sourceContents = getWebContents(sourceWebContentsId);
    const devToolsContents = getWebContents(devToolsWebContentsId);

    sourceContents.setDevToolsWebContents(devToolsContents);
    sourceContents.openDevTools();

    devToolsContents.once("did-finish-load", () => {
      paneDevTools.set(sourceWebContentsId, devToolsContents);
      const inspection = pendingInspections.get(sourceWebContentsId);
      if (inspection) {
        pendingInspections.delete(sourceWebContentsId);
        void inspectAgain(sourceContents, inspection.x, inspection.y);
      }
    });
    devToolsContents.once("destroyed", () => {
      if (paneDevTools.get(sourceWebContentsId) === devToolsContents) {
        paneDevTools.delete(sourceWebContentsId);
      }
    });

    // DevTools first loads without its connection to the page, and a reload
    // in the same frame picks it up.
    // TODO: Remove this, along with the RenderDocument switch in main.ts, once
    // an Electron release shows a webview's DevTools with RenderDocument on.
    devToolsContents.executeJavaScript("window.location.reload()");
  },
};

export default service;

declare module "@shared/rpc" {
  interface Services {
    browser: typeof service;
  }
}
