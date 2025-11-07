import { useCommand } from "@/commands/hooks/useCommand";
import { normalizeKeybinding } from "@/commands/keybindings/utils";
import { enterFocusMode } from "@/store/actions/focusMode";
import {
  closePane,
  movePane,
  splitPane,
  splitPaneWithAgentSession,
} from "@/store/actions/pane";
import { closeTab, duplicateTab, movePaneToTab } from "@/store/actions/tab";
import { tabsAtom } from "@/store/atoms";
import { ApplicationCommands } from "@shared/commands";
import { useAtomValue } from "jotai";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseContextMenuParams = {
  setTitleModal: (tabId: string, value: string) => void;
  canChangeTitle: (tabId: string) => boolean;
  setShowDuplicateTabWithCwdDialog: (show: boolean) => void;
};

const api = window.conduit;

export function useContextMenu({
  setTitleModal,
  canChangeTitle,
  setShowDuplicateTabWithCwdDialog,
}: UseContextMenuParams) {
  const tabs = useAtomValue(tabsAtom);
  const [hasGitRepoCache, setHasGitRepoCache] = useState<
    Record<string, boolean>
  >({});

  // Get command info for context menu commands
  const duplicateTabCmd = useCommand(ApplicationCommands.TAB_DUPLICATE);
  const duplicateTabWithCwdCmd = useCommand(ApplicationCommands.TAB_DUPLICATE_WITH_CWD);
  const closeTabCmd = useCommand(ApplicationCommands.TAB_CLOSE);

  // Build command data for IPC
  const commandData = useMemo(() => {
    return {
      [ApplicationCommands.TAB_DUPLICATE]: {
        keybinding: duplicateTabCmd.keybindings[0]
          ? normalizeKeybinding(duplicateTabCmd.keybindings[0].chords)
          : undefined,
        enabled: !duplicateTabCmd.disabled,
      },
      [ApplicationCommands.TAB_DUPLICATE_WITH_CWD]: {
        keybinding: duplicateTabWithCwdCmd.keybindings[0]
          ? normalizeKeybinding(duplicateTabWithCwdCmd.keybindings[0].chords)
          : undefined,
        enabled: !duplicateTabWithCwdCmd.disabled,
      },
      [ApplicationCommands.TAB_CLOSE]: {
        keybinding: closeTabCmd.keybindings[0]
          ? normalizeKeybinding(closeTabCmd.keybindings[0].chords)
          : undefined,
        enabled: !closeTabCmd.disabled,
      },
    };
  }, [duplicateTabCmd, duplicateTabWithCwdCmd, closeTabCmd]);

  const checkGitRepo = useCallback(
    async (cwd: string | null | undefined): Promise<boolean> => {
      if (!cwd) return false;

      if (hasGitRepoCache[cwd] !== undefined) {
        return hasGitRepoCache[cwd];
      }

      try {
        const hasRepo = await api.hasGitRepository(cwd);
        setHasGitRepoCache((prev) => ({ ...prev, [cwd]: hasRepo }));
        return hasRepo;
      } catch (error) {
        setHasGitRepoCache((prev) => ({ ...prev, [cwd]: false }));
        return false;
      }
    },
    [hasGitRepoCache],
  );

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
        commandData,
      });
    },
    [api, tabs, canChangeTitle, checkGitRepo, commandData],
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
          case "duplicate-tab":
            void duplicateTab(tabId);
            break;
          case "duplicate-tab-with-cwd":
            setShowDuplicateTabWithCwdDialog(true);
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
              void splitPaneWithAgentSession(
                tabId,
                resolvedPaneId,
                "row",
                true,
              );
            }
            break;
          case "split-bottom-agent":
            if (resolvedPaneId) {
              void splitPaneWithAgentSession(tabId, resolvedPaneId, "column");
            }
            break;
          case "split-top-agent":
            if (resolvedPaneId) {
              void splitPaneWithAgentSession(
                tabId,
                resolvedPaneId,
                "column",
                true,
              );
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
      },
    );

    return () => {
      unsubscribeContextMenu();
    };
  }, [
    api,
    tabs,
    closeTab,
    duplicateTab,
    movePane,
    movePaneToTab,
    setTitleModal,
    setShowDuplicateTabWithCwdDialog,
    splitPane,
    splitPaneWithAgentSession,
  ]);

  return handleContextMenu;
}
