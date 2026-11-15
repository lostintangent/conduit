import { BrowserPane } from "@features/browser/components/BrowserPane";
import {
  activatePane,
  closePane,
  openBrowserPane,
  updatePaneProperty,
} from "@features/workbench/client/actions/pane";
import type { LayoutPaneProps } from "@features/workbench/components/layout/paneKinds";
import type { BrowserPane as BrowserPaneType } from "@features/workbench/model";
import type React from "react";

export default function BrowserLayoutPane({
  pane,
  tab,
  isActive,
  isInPreview,
  isResizing,
  onActivate,
  onContextMenu,
  onHover,
}: LayoutPaneProps<BrowserPaneType>) {
  const devToolsPane = Object.values(tab.panes).find(
    (p) => p.type === "browser" && p.devToolsFor === pane.id,
  );

  return (
    <div
      className="flex flex-1 w-full h-full min-h-0 min-w-0"
      onContextMenu={onContextMenu}
      onMouseDown={onActivate}
    >
      <BrowserPane
        url={pane.url}
        paneId={pane.id}
        tabId={tab.id}
        disableInteraction={isResizing}
        isActive={isActive}
        // The page reports its context menu as coordinates, not a DOM event
        onContextMenu={({ clientX, clientY }) =>
          onContextMenu({
            preventDefault: () => {},
            stopPropagation: () => {},
            clientX,
            clientY,
          } as React.MouseEvent)
        }
        onUrlChange={(url) => updatePaneProperty(tab.id, pane.id, { url })}
        onTitleChange={(title) =>
          updatePaneProperty(tab.id, pane.id, { title })
        }
        onOpenPage={(url, background) => {
          openBrowserPane(tab.id, pane.id, url);
          if (background) activatePane(tab.id, pane.id);
        }}
        isInPreview={isInPreview}
        onHover={onHover}
        devToolsFor={pane.devToolsFor}
        chromeless={pane.chromeless}
        isDevToolsOpen={devToolsPane !== undefined}
        onToggleDevTools={() => {
          if (devToolsPane) {
            closePane(tab.id, devToolsPane.id);
          } else {
            openBrowserPane(
              tab.id,
              pane.id,
              "about:blank",
              "column",
              false,
              true,
            );
          }
        }}
        onHideToolbar={() =>
          updatePaneProperty(tab.id, pane.id, { chromeless: true })
        }
      />
    </div>
  );
}
