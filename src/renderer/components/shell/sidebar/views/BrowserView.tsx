/**
 * BrowserView - Browser view for the sidebar
 *
 * Renders a BrowserPane for the sidebar. URL state is managed at two levels:
 *
 * 1. cwdCache (per-CWD): Stores URLs from explicit navigation requests (deep links
 *    from terminal). These represent "show this URL in context of this project".
 *    When CWD changes, we restore the cached URL for that directory.
 *
 * 2. persistedUrl (global): Stores the current URL for manual browsing that has
 *    no project association. Used as fallback when no CWD-specific cache exists.
 *
 * Priority on mount/CWD change: cwdCache > persistedUrl > undefined (about:blank)
 *
 * When no URL is set, passes "about:blank" which triggers the MRU dropdown
 * in BrowserToolbar.
 */

import { BrowserPane } from "@/components/panes/browser/BrowserPane";
import { noop } from "@/utils";
import { useCallback, useEffect, useState } from "react";
import { useSidebarNavigationField } from "../hooks/useSidebarNavigation";
import { cwdCache, sidebarPaneIds } from "../utils";

// =============================================================================
// Types
// =============================================================================

interface BrowserViewProps {
  cwd: string;
}

// =============================================================================
// Main Component
// =============================================================================

// Module-level fallback URL for manual browsing (no project association).
// Only used when no CWD-specific cached URL exists.
let persistedUrl: string | undefined;

export function BrowserView({ cwd }: BrowserViewProps) {
  // Current URL state - initialized with CWD cache taking priority
  const [currentUrl, setCurrentUrl] = useState(
    () => cwdCache.get(cwd, "browser-url") ?? persistedUrl,
  );

  // When CWD changes, prefer CWD-cached URL, fall back to persisted
  useEffect(() => {
    const cachedUrl = cwdCache.get(cwd, "browser-url");
    setCurrentUrl(cachedUrl ?? persistedUrl);
  }, [cwd]);

  // Consume browser URL navigation requests (deep linking from terminal, etc.)
  useSidebarNavigationField("browserUrl", (url) => {
    cwdCache.set(cwd, "browser-url", url);
    setCurrentUrl(url);
    persistedUrl = url;
  });

  // Track URL changes from browser navigation (MRU, typing, clicking links)
  const handleUrlChange = useCallback((url: string) => {
    if (url && url !== "about:blank") {
      setCurrentUrl(url);
      persistedUrl = url;
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
