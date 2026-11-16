import type { WebviewTag } from "electron";
import type { PageIcon } from "@shared/types/panes";
import { loadPageIcon } from "./pageIcon";
import { siteOf } from "./url";

/**
 * A browser pane's page. Its webview lives on the body under the pane's id,
 * so it keeps its page as the pane moves between layouts.
 */
export const getWebview = (paneId: string) =>
  document.getElementById(paneId) as WebviewTag | null;

/** New panes whose page takes the keyboard when the pane first shows */
const pagesToFocus = new Set<string>();

/**
 * Has a new pane's page take the keyboard when the pane first shows, since
 * the page the user just opened is what they'll use next.
 */
export const focusPageOnOpen = (paneId: string) => {
  pagesToFocus.add(paneId);
};

/** Whether the pane's page should take the keyboard, which it does once */
export const takePageFocus = (paneId: string) => pagesToFocus.delete(paneId);

/** Panes whose page reopens with its history, which main has set aside */
let pagesToRestore = new Set<string>();

/**
 * Has these panes' pages get their history back as their webviews attach, in
 * place of the panes marked before, which a workspace that opened since
 * replaced.
 */
export const restorePagesOnOpen = (paneIds: string[]) => {
  pagesToRestore = new Set(paneIds);
};

/** Whether the pane's page reopens with its history, which it does once */
export const takePageRestore = (paneId: string) =>
  pagesToRestore.delete(paneId);

/**
 * Loads the page in the webview. A page that doesn't load says why in its
 * pane, so a failed load needs nothing more here.
 */
export const loadPage = (webview: WebviewTag, url: string) => {
  webview.loadURL(url).catch(() => {});
};

/** Why a page didn't load, as Chromium names it */
export type LoadFailure = {
  /** Chromium's net error code, like -105 */
  code: number;
  /** Its name, like ERR_NAME_NOT_RESOLVED */
  name: string;
  url: string;
};

/**
 * The pages that didn't load. A pane can leave its page and come back to it,
 * so this lives as long as the page.
 */
export const loadFailures = new WeakMap<WebviewTag, LoadFailure>();

/** The page's web contents, which a webview only has once Electron creates it */
export function getWebContentsId(webview: WebviewTag): number | undefined {
  try {
    return webview.getWebContentsId();
  } catch {
    return undefined;
  }
}

/** What a page tells the pane that shows it */
export type PageReports = {
  onUrlChange: (url: string) => void;
  onTitleChange: (title: string) => void;
  /** Reports the page's icon, or that it has none. Without it, none loads. */
  onIconChange?: (icon: PageIcon | undefined) => void;
};

/** The pane each page reports to, which is the one that showed it last */
const pageReports = new WeakMap<
  WebviewTag,
  { readonly current: PageReports }
>();

/**
 * Has the page report where it goes, what it's called and its site's icon to
 * the pane's latest `reports`. A hidden tab's panes stop their effects, so the
 * page reports through listeners of its own, which keep its tab's label and
 * its saved address current while it's in the background. They go with the
 * webview, which goes with its pane. `url` is where the pane was saved, which
 * a saved icon goes with.
 */
export function reportPage(
  webview: WebviewTag,
  url: string,
  reports: { readonly current: PageReports },
) {
  const isReporting = pageReports.has(webview);
  pageReports.set(webview, reports);
  if (isReporting) return;

  const report = () => pageReports.get(webview)?.current;
  const icon = followIcon(webview, url, report);
  const goTo = (url: string) => {
    icon.showSiteOf(url);
    report()?.onUrlChange(url);
  };

  webview.addEventListener("did-navigate", ({ url }) => goTo(url));
  // A frame in the page moving within itself leaves the page where it was
  webview.addEventListener("did-navigate-in-page", ({ url, isMainFrame }) => {
    if (isMainFrame) goTo(url);
  });
  // A stopped load leaves the page as it was
  webview.addEventListener(
    "did-fail-load",
    ({ validatedURL, isMainFrame, errorCode }) => {
      if (isMainFrame && errorCode !== -3) goTo(validatedURL);
    },
  );
  webview.addEventListener("page-title-updated", ({ title }) =>
    report()?.onTitleChange(title),
  );
  webview.addEventListener("page-favicon-updated", ({ favicons }) =>
    icon.load(favicons),
  );
  webview.addEventListener("did-stop-loading", () => icon.showUnreported());
}

/**
 * Follows a page's icon from site to site. An icon goes as soon as its page
 * leaves for another site, which has its own.
 */
function followIcon(
  webview: WebviewTag,
  url: string,
  report: () => PageReports | undefined,
) {
  const icons: {
    /** The site of the page the icon goes with, which a saved icon was saved with */
    site: string | undefined;
    /** The latest icon to load, which an earlier one gives way to */
    request?: object;
    /** The icons the webview last reported, which it doesn't report again */
    reported?: { urls: string; icon: Promise<PageIcon | undefined> };
    /** Whether the page came to a new site without the webview reporting icons */
    unreported: boolean;
  } = { site: siteOf(url), unreported: false };

  // A page's icon loads a moment after the page, so one that loads for a
  // page before the latest, or on a site the webview has left, is dropped.
  const show = async (icon: Promise<PageIcon | undefined>) => {
    const request = {};
    icons.request = request;
    const shown = await icon;
    if (request === icons.request) report()?.onIconChange?.(shown);
  };

  // The webview only reports icons that differ from the last ones it
  // reported, even on another site, so once a page on a new site has loaded
  // without a report, it has the last ones if it links to them, as Gist
  // does to GitHub's. New ones are reported only after the page stops
  // loading, so a page that stops without a report may still have new ones
  // coming, and only its links tell the two apart.
  const urlSet = (urls: string[]) => [...new Set(urls)].sort().join(" ");

  return {
    showSiteOf(url: string) {
      const site = siteOf(url);
      if (site === icons.site) return;
      icons.site = site;
      icons.request = undefined;
      icons.unreported = true;
      report()?.onIconChange?.(undefined);
    },

    load(favicons: string[]) {
      icons.unreported = false;
      const webContentsId = getWebContentsId(webview);
      if (!report()?.onIconChange || webContentsId === undefined) return;

      const icon = loadPageIcon(webContentsId, favicons).catch(() => undefined);
      icons.reported = { urls: urlSet(favicons), icon };
      void show(icon);
    },

    async showUnreported() {
      const { reported } = icons;
      const webContentsId = getWebContentsId(webview);
      if (!icons.unreported || !reported || webContentsId === undefined) return;
      icons.unreported = false;

      const linked = await window.conduit.browser
        .linkedIcons(webContentsId)
        .catch(() => []);
      if (
        urlSet(linked) === reported.urls &&
        reported === icons.reported &&
        !icons.unreported
      ) {
        void show(reported.icon);
      }
    },
  };
}
