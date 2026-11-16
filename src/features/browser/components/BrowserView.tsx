/**
 * The sidebar's browser. It shows one page for the whole app, which stays put
 * as you switch folders and saves with the workspace. Terminal links set to
 * open in the sidebar load there through `showInSidebarBrowser`.
 */

import { BrowserPane } from "@features/browser/components/BrowserPane";
import { sidebarBrowserUrlAtom } from "@features/browser/client/sidebar";
import { sidebarPaneIds } from "@features/workbench/client/sidebarStore";
import { noop } from "@/utils";
import { useSelector } from "@tanstack/react-store";

// Remembers the page so a new webview starts there
const handleUrlChange = (url: string) => {
  if (url && url !== "about:blank") sidebarBrowserUrlAtom.set(url);
};

export function BrowserView() {
  const url = useSelector(sidebarBrowserUrlAtom);

  return (
    <BrowserPane
      url={url ?? "about:blank"}
      paneId={sidebarPaneIds.browser()}
      tabId={undefined}
      onUrlChange={handleUrlChange}
      onTitleChange={noop}
      onContextMenu={noop}
      onHover={noop}
      isResizing={false}
      isInPreview={false}
      isDevToolsOpen={false}
      onToggleDevTools={noop}
      onHideToolbar={noop}
    />
  );
}
