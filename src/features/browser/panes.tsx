import { pageMenu } from "@features/browser/client/pageMenu";
import { getWebview } from "@features/browser/client/webview";
import { BrowserPane } from "@features/browser/components/BrowserPane";
import {
  activatePane,
  closePane,
  openBrowserPane,
  updatePaneProperty,
} from "@features/workbench/client/actions/pane";
import type { LayoutPaneProps } from "@features/workbench/components/layout/paneKinds";
import type {
  BrowserPane as BrowserPaneType,
  PaneIcon,
} from "@features/workbench/model";
import type React from "react";

/** Tells icons apart by their image, since each load draws a new one */
const iconKey = (icon: PaneIcon | undefined) =>
  typeof icon === "string" ? icon : icon?.src;

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
  const openDevTools = () => {
    if (!devToolsPane) {
      openBrowserPane(tab.id, pane.id, "about:blank", "column", false, true);
    }
  };

  return (
    <div
      className="flex flex-1 w-full h-full min-h-0 min-w-0"
      onContextMenu={onContextMenu}
      onMouseDown={onActivate}
    >
      <BrowserPane
        url={pane.url}
        hasIcon={pane.icon !== undefined && pane.icon !== "loading"}
        paneId={pane.id}
        tabId={tab.id}
        disableInteraction={isResizing}
        isActive={isActive}
        // The page reports its context menu itself, not as a DOM event
        onContextMenu={(params) => {
          const webview = getWebview(pane.id);
          onContextMenu(
            {
              preventDefault: () => {},
              stopPropagation: () => {},
            } as React.MouseEvent,
            webview && !pane.devToolsFor
              ? pageMenu(params, {
                  webview,
                  openPage: (url) => openBrowserPane(tab.id, pane.id, url),
                  openDevTools,
                  showToolbar: pane.chromeless
                    ? () =>
                        updatePaneProperty(tab.id, pane.id, {
                          chromeless: false,
                        })
                    : undefined,
                })
              : undefined,
          );
        }}
        onUrlChange={(url) => updatePaneProperty(tab.id, pane.id, { url })}
        onTitleChange={(title) =>
          updatePaneProperty(tab.id, pane.id, { title })
        }
        // A DevTools pane shows DevTools, not a site with an icon
        onIconChange={
          pane.devToolsFor
            ? undefined
            : (icon) => {
                if (iconKey(icon) !== iconKey(pane.icon)) {
                  updatePaneProperty(tab.id, pane.id, { icon });
                }
              }
        }
        onAudibleChange={(audible) =>
          updatePaneProperty(tab.id, pane.id, { audible })
        }
        onAttach={(webContentsId) => {
          if (webContentsId !== pane.webContentsId) {
            updatePaneProperty(tab.id, pane.id, { webContentsId });
          }
        }}
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
            openDevTools();
          }
        }}
        onHideToolbar={() =>
          updatePaneProperty(tab.id, pane.id, { chromeless: true })
        }
      />
    </div>
  );
}
