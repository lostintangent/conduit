import { showInSidebarBrowser } from "@features/browser/client/sidebar";
import { useSettings } from "@features/settings/client/queries";
import type { TerminalLinkTarget } from "@features/settings/model";
import { TerminalPane } from "@features/terminal/components/TerminalPane";
import { getWebview } from "@features/browser/client/webview";
import {
  activatePane,
  openBrowserPane,
  updatePaneProperty,
} from "@features/workbench/client/actions/pane";
import { applicationModeAtom } from "@features/workbench/client/atoms";
import type { LayoutPaneProps } from "@features/workbench/components/layout/paneKinds";
import type {
  Tab,
  TerminalPane as TerminalPaneType,
} from "@features/workbench/model";
import { useSelector } from "@tanstack/react-store";

export default function TerminalLayoutPane({
  pane,
  tab,
  isActive,
  isInPreview,
  hideIndividualSandboxIndicator,
  onActivate,
  onContextMenu,
}: LayoutPaneProps<TerminalPaneType>) {
  const terminalLinkTarget = useSettings((s) => s.terminalLinkTarget);
  const applicationMode = useSelector(applicationModeAtom);

  return (
    <TerminalPane
      pane={pane}
      tabId={tab.id}
      isActive={isActive}
      onActivate={onActivate}
      onContextMenu={onContextMenu}
      // Resolve cloned terminal's sessionId here to avoid TerminalPane subscribing to all tabs
      resolvedSessionId={
        pane.cloneOf
          ? ((tab.panes[pane.cloneOf] as typeof pane)?.sessionId ??
            pane.sessionId)
          : pane.sessionId
      }
      onLinkClick={(url, newPane) =>
        followLink(url, newPane, tab, pane, terminalLinkTarget)
      }
      showDimensions={applicationMode === "normal" && !isInPreview}
      hideIndividualSandboxIndicator={hideIndividualSandboxIndicator}
      isTabSynchronized={tab.synchronized}
    />
  );
}

/**
 * Follows a terminal's link where its link target says, or to a new browser
 * pane on Cmd-Shift-click. A link's browser pane opens beside the terminal,
 * which keeps the keys, and the terminal's later links load there while it's
 * open.
 */
function followLink(
  url: string,
  newPane: boolean,
  tab: Tab,
  pane: TerminalPaneType,
  target: TerminalLinkTarget,
) {
  const linkPage =
    pane.linkPane && tab.panes[pane.linkPane] && getWebview(pane.linkPane);
  if (!newPane && target === "sidebar") {
    showInSidebarBrowser(url);
  } else if (!newPane && target === "default") {
    window.conduit.workbench.openExternal(url);
  } else if (!newPane && linkPage) {
    // Setting src, unlike loadURL, never throws and catches a failed load
    linkPage.src = url;
  } else {
    const linkPane = openBrowserPane(tab.id, pane.id, url);
    updatePaneProperty<TerminalPaneType>(tab.id, pane.id, { linkPane });
  }
  // A link keeps its click from the pane, so it activates the terminal here
  activatePane(tab.id, pane.id);
}
