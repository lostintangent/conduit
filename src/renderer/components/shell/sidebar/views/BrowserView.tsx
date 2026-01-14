/**
 * BrowserView - Browser view for the sidebar
 *
 * Renders a BrowserPane for the sidebar. URL state is managed at two levels:
 *
 * 1. cwdBrowserUrl (per-CWD): Stores URLs from explicit navigation requests (deep links
 *    from terminal). These represent "show this URL in context of this project".
 *    When CWD changes, we restore the cached URL for that directory.
 *
 * 2. browserFallbackUrl (global): Stores the current URL for manual browsing that has
 *    no project association. Used as fallback when no CWD-specific cache exists.
 *
 * Priority on mount/CWD change: cwdBrowserUrl > browserFallbackUrl > undefined (about:blank)
 *
 * When no URL is set, passes "about:blank" which triggers the MRU dropdown
 * in BrowserToolbar.
 */

import { BrowserPane } from "@/components/panes/browser/BrowserPane";
import {
  getBrowserFallbackUrl,
  getCwdBrowserUrl,
  setBrowserFallbackUrl,
  setCwdBrowserUrl,
  sidebarPaneIds,
} from "@/store/sidebarStore";
import { noop } from "@/utils";
import { useCallback, useEffect, useState } from "react";
import { useSidebarNavigationField } from "../hooks/useSidebarNavigation";

interface BrowserViewProps {
  cwd: string;
}

export function BrowserView({ cwd }: BrowserViewProps) {
  // Current URL state - initialized with CWD cache taking priority
  const [currentUrl, setCurrentUrl] = useState(
    () => getCwdBrowserUrl(cwd) ?? getBrowserFallbackUrl(),
  );

  // When CWD changes, prefer CWD-cached URL, fall back to persisted
  useEffect(() => {
    const cachedUrl = getCwdBrowserUrl(cwd);
    setCurrentUrl(cachedUrl ?? getBrowserFallbackUrl());
  }, [cwd]);

  // Consume browser URL navigation requests (deep linking from terminal, etc.)
  useSidebarNavigationField("browserUrl", (url) => {
    setCwdBrowserUrl(cwd, url);
    setCurrentUrl(url);
    setBrowserFallbackUrl(url);
  });

  // Track URL changes from browser navigation (MRU, typing, clicking links)
  const handleUrlChange = useCallback((url: string) => {
    if (url && url !== "about:blank") {
      setCurrentUrl(url);
      setBrowserFallbackUrl(url);
    }
  }, []);

  return (
    <BrowserPane
      url={currentUrl || "about:blank"}
      paneId={sidebarPaneIds.browser()}
      tabId={undefined}
      onUrlChange={handleUrlChange}
      onTitleChange={noop}
      onContextMenu={noop}
      onHover={noop}
      disableInteraction={false}
      isInPreview={false}
      isDevToolsOpen={false}
      onToggleDevTools={noop}
      onHideToolbar={noop}
    />
  );
}
