import { createAtom } from "@/createAtom";
import {
  sidebarPaneIds,
  sidebarStateAtom,
} from "@features/workbench/client/sidebarStore";
import { getWebview } from "./webview";

/** The sidebar browser's page. It's one page for the whole app. */
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
