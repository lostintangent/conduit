import { useSettings } from "@features/settings/client/queries";
import { TerminalPane } from "@features/terminal/components/TerminalPane";
import { openBrowserPane } from "@features/workbench/client/actions/pane";
import { applicationModeAtom } from "@features/workbench/client/atoms";
import { sidebarStateAtom } from "@features/workbench/client/sidebarStore";
import type { LayoutPaneProps } from "@features/workbench/components/layout/paneKinds";
import type { TerminalPane as TerminalPaneType } from "@features/workbench/model";
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
      onLinkClick={(url) => {
        if (terminalLinkTarget === "sidebar") {
          sidebarStateAtom.set({
            isOpen: true,
            view: "browser",
            navigation: {
              cwd: pane.cwd ?? undefined,
              browserUrl: url,
            },
          });
        } else if (terminalLinkTarget === "default") {
          window.conduit.openExternal(url);
        } else {
          openBrowserPane(tab.id, pane.id, url);
        }
      }}
      showDimensions={applicationMode === "normal" && !isInPreview}
      hideIndividualSandboxIndicator={hideIndividualSandboxIndicator}
      isTabSynchronized={tab.synchronized}
    />
  );
}
