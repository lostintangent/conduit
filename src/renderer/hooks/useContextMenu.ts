import { useCallback, useEffect } from "react";
import { useAtomValue } from "jotai";
import type { MouseEvent } from "react";
import { tabsAtom } from "@/store/atoms";
import { movePane, splitPane } from "@/store/actions/pane";
import { closeTab, movePaneToTab } from "@/store/actions/tab";

type UseContextMenuParams = {
  closePane: (tabId: string, paneId: string) => void;
  setTitleModal: (tabId: string, value: string) => void;
  canChangeTitle: (tabId: string) => boolean;
};

const api = window.conduit;

export const useContextMenu = ({
  closePane,
  setTitleModal,
  canChangeTitle,
}: UseContextMenuParams) => {
  const tabs = useAtomValue(tabsAtom);

  const handleContextMenu = useCallback(
    (event: MouseEvent, tabId: string, paneId?: string) => {
      event.preventDefault();
      event.stopPropagation();

      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) {
        return;
      }

      const allowTitleChange = canChangeTitle(tabId);

      api.showContextMenu({
        tabId,
        paneId,
        canChangeTitle: allowTitleChange,
      });
    },
    [api, tabs, canChangeTitle]
  );

  useEffect(() => {
    const unsubscribeContextMenu = api.onContextMenuAction(
      ({ action, tabId, paneId }) => {
        const tab = tabs.find((t) => t.id === tabId);
        if (!tab) {
          return;
        }

        const availablePaneIds = Object.keys(tab.panes);
        const resolvedPaneId =
          (paneId && tab.panes[paneId] ? paneId : undefined) ??
          (tab.activePaneId && tab.panes[tab.activePaneId]
            ? tab.activePaneId
            : undefined) ??
          availablePaneIds[0];

        switch (action) {
          case "change-title":
            setTitleModal(tabId, tab.title ?? "");
            break;
          case "split-right":
            if (resolvedPaneId) {
              void splitPane(tabId, resolvedPaneId, "row");
            }
            break;
          case "split-left":
            if (resolvedPaneId) {
              void splitPane(tabId, resolvedPaneId, "row", true);
            }
            break;
          case "split-bottom":
            if (resolvedPaneId) {
              void splitPane(tabId, resolvedPaneId, "column");
            }
            break;
          case "split-top":
            if (resolvedPaneId) {
              void splitPane(tabId, resolvedPaneId, "column", true);
            }
            break;
          case "move-left":
            if (resolvedPaneId) {
              movePane(tabId, resolvedPaneId, "left");
            }
            break;
          case "move-right":
            if (resolvedPaneId) {
              movePane(tabId, resolvedPaneId, "right");
            }
            break;
          case "move-up":
            if (resolvedPaneId) {
              movePane(tabId, resolvedPaneId, "up");
            }
            break;
          case "move-down":
            if (resolvedPaneId) {
              movePane(tabId, resolvedPaneId, "down");
            }
            break;
          case "move-to-tab":
            if (resolvedPaneId) {
              movePaneToTab(tabId, resolvedPaneId);
            }
            break;
          case "close":
            if (!paneId) {
              closeTab(tabId);
            } else if (resolvedPaneId) {
              closePane(tabId, resolvedPaneId);
            }
            break;
        }
      }
    );

    return () => {
      unsubscribeContextMenu();
    };
  }, [
    api,
    tabs,
    closePane,
    closeTab,
    movePane,
    movePaneToTab,
    setTitleModal,
    splitPane,
  ]);

  return handleContextMenu;
};
