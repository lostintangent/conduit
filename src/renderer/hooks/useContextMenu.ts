import { enterFocusMode } from "@/store/actions/focusMode";
import { movePane, splitPane, splitPaneWithAgentSession } from "@/store/actions/pane";
import { closeTab, movePaneToTab } from "@/store/actions/tab";
import { tabsAtom } from "@/store/atoms";
import { useAtomValue } from "jotai";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useState } from "react";

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
  const [hasGitRepoCache, setHasGitRepoCache] = useState<Record<string, boolean>>({});

  const checkGitRepo = useCallback(async (cwd: string | null | undefined): Promise<boolean> => {
    if (!cwd) return false;

    if (hasGitRepoCache[cwd] !== undefined) {
      return hasGitRepoCache[cwd];
    }

    try {
      const hasRepo = await api.hasGitRepository(cwd);
      setHasGitRepoCache(prev => ({ ...prev, [cwd]: hasRepo }));
      return hasRepo;
    } catch (error) {
      setHasGitRepoCache(prev => ({ ...prev, [cwd]: false }));
      return false;
    }
  }, [hasGitRepoCache]);

  const handleContextMenu = useCallback(
    async (event: MouseEvent, tabId: string, paneId?: string) => {
      event.preventDefault();
      event.stopPropagation();

      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) {
        return;
      }

      const allowTitleChange = canChangeTitle(tabId);

      let hasGitRepo = false;
      if (paneId) {
        const pane = tab.panes[paneId];
        if (pane && pane.type === "terminal") {
          hasGitRepo = await checkGitRepo(pane.cwd);
        }
      } else {
        const activePane = tab.panes[tab.activePaneId];
        if (activePane && activePane.type === "terminal") {
          hasGitRepo = await checkGitRepo(activePane.cwd);
        }
      }

      api.showContextMenu({
        tabId,
        paneId,
        canChangeTitle: allowTitleChange,
        hasGitRepo,
      });
    },
    [api, tabs, canChangeTitle, checkGitRepo]
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
          case "focus-pane":
            if (resolvedPaneId) {
              enterFocusMode(tabId, resolvedPaneId);
            }
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
          case "split-right-agent":
            if (resolvedPaneId) {
              void splitPaneWithAgentSession(tabId, resolvedPaneId, "row");
            }
            break;
          case "split-left-agent":
            if (resolvedPaneId) {
              void splitPaneWithAgentSession(tabId, resolvedPaneId, "row", true);
            }
            break;
          case "split-bottom-agent":
            if (resolvedPaneId) {
              void splitPaneWithAgentSession(tabId, resolvedPaneId, "column");
            }
            break;
          case "split-top-agent":
            if (resolvedPaneId) {
              void splitPaneWithAgentSession(tabId, resolvedPaneId, "column", true);
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
    splitPaneWithAgentSession,
  ]);

  return handleContextMenu;
};
