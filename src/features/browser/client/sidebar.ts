import { createAtom } from "@/createAtom";
import type { WebviewTag } from "electron";
import type { SidebarPage } from "@features/browser/model";
import {
  closeSidebar,
  sidebarPaneIds,
  sidebarStateAtom,
} from "@features/workbench/client/sidebarStore";
import { getWebview } from "./webview";

/**
 * The sidebar browser's page. It's one page for the whole app, which saves
 * with the workspace.
 */
export const sidebarBrowserUrlAtom = createAtom<string | undefined>(undefined);

/** Opens the sidebar on its browser, showing `url`. */
export function showInSidebarBrowser(url: string): void {
  sidebarBrowserUrlAtom.set(url);
  // Its webview outlives the sidebar, so load the page there if it's up.
  // Otherwise the sidebar creates one at this URL. Setting src, unlike
  // loadURL, never throws and catches a failed load.
  const webview = getWebview(sidebarPaneIds.browser());
  if (webview) webview.src = url;
  sidebarStateAtom.set({ isOpen: true, view: "browser" });
}

/** The sidebar's page, as the workspace saves it. */
export function sidebarPage(): SidebarPage | undefined {
  const url = sidebarBrowserUrlAtom.get();
  if (!url) return undefined;
  const { isOpen, view } = sidebarStateAtom.get();
  return { url, isOpen: isOpen && view === "browser" };
}

/**
 * Shows the page a workspace saved, without the page it replaces in its
 * back/forward history. The sidebar shows its browser as the workspace had it,
 * and stays as it is on its other views.
 */
export function openSidebarPage(page: SidebarPage | undefined): void {
  if (page?.url !== sidebarBrowserUrlAtom.get()) {
    sidebarBrowserUrlAtom.set(() => page?.url);
    // Its webview outlives the sidebar, so the page changes there. Without
    // one, the sidebar makes one at this page the next time it shows.
    const webview = getWebview(sidebarPaneIds.browser());
    if (webview) startOver(webview, page?.url ?? "about:blank");
  }
  const { isOpen, view } = sidebarStateAtom.get();
  if (page?.isOpen) {
    sidebarStateAtom.set({ isOpen: true, view: "browser" });
  } else if (isOpen && view === "browser") {
    closeSidebar();
  }
}

/** Loads `url` and forgets the pages before it, once it's there. */
function startOver(webview: WebviewTag, url: string): void {
  const forgetEarlierPages = () => {
    webview.removeEventListener("did-navigate", forgetEarlierPages);
    webview.clearHistory();
  };
  webview.addEventListener("did-navigate", forgetEarlierPages);
  webview.src = url;
}
