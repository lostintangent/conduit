import { executeCommand } from "@/commands";
import { useCommand } from "@/commands/hooks/useCommand";
import { formatKeybindingForElectron } from "@/commands/keybindings/utils";
import { tabsAtom } from "@/store/atoms";
import { ApplicationCommands } from "@shared/commands";
import { useAtomValue } from "jotai";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseContextMenuParams = {
  canChangeTitle: (tabId: string) => boolean;
};

const api = window.conduit;

export function useContextMenu({
  canChangeTitle,
}: UseContextMenuParams) {
  const tabs = useAtomValue(tabsAtom);
  const [hasGitRepoCache, setHasGitRepoCache] = useState<
    Record<string, boolean>
  >({});

  // Get command info for context menu commands
  const changeTitleCmd = useCommand(ApplicationCommands.TAB_CHANGE_TITLE);
  const duplicateTabCmd = useCommand(ApplicationCommands.TAB_DUPLICATE);
  const duplicateTabWithCwdCmd = useCommand(ApplicationCommands.TAB_DUPLICATE_WITH_CWD);
  const closeTabCmd = useCommand(ApplicationCommands.TAB_CLOSE);
  const focusPaneCmd = useCommand(ApplicationCommands.PANE_FOCUS);
  const closePaneCmd = useCommand(ApplicationCommands.PANE_CLOSE);
  const splitLeftCmd = useCommand(ApplicationCommands.PANE_SPLIT_LEFT);
  const splitRightCmd = useCommand(ApplicationCommands.PANE_SPLIT_RIGHT);
  const splitTopCmd = useCommand(ApplicationCommands.PANE_SPLIT_TOP);
  const splitBottomCmd = useCommand(ApplicationCommands.PANE_SPLIT_BOTTOM);
  const splitLeftAgentCmd = useCommand(ApplicationCommands.PANE_SPLIT_LEFT_AGENT);
  const splitRightAgentCmd = useCommand(ApplicationCommands.PANE_SPLIT_RIGHT_AGENT);
  const splitTopAgentCmd = useCommand(ApplicationCommands.PANE_SPLIT_TOP_AGENT);
  const splitBottomAgentCmd = useCommand(ApplicationCommands.PANE_SPLIT_BOTTOM_AGENT);
  const moveLeftCmd = useCommand(ApplicationCommands.PANE_MOVE_LEFT);
  const moveRightCmd = useCommand(ApplicationCommands.PANE_MOVE_RIGHT);
  const moveUpCmd = useCommand(ApplicationCommands.PANE_MOVE_UP);
  const moveDownCmd = useCommand(ApplicationCommands.PANE_MOVE_DOWN);
  const moveToTabCmd = useCommand(ApplicationCommands.PANE_MOVE_TO_TAB);

  // Build command data for IPC
  const commandData = useMemo(() => {
    const buildCommandData = (cmd: ReturnType<typeof useCommand>) => {
      const keybinding = cmd.keybindings[0]
        ? formatKeybindingForElectron(cmd.keybindings[0].chords)
        : undefined;
      return {
        keybinding,
        enabled: !cmd.disabled,
      };
    };

    return {
      [ApplicationCommands.TAB_CHANGE_TITLE]: buildCommandData(changeTitleCmd),
      [ApplicationCommands.TAB_DUPLICATE]: buildCommandData(duplicateTabCmd),
      [ApplicationCommands.TAB_DUPLICATE_WITH_CWD]: buildCommandData(duplicateTabWithCwdCmd),
      [ApplicationCommands.TAB_CLOSE]: buildCommandData(closeTabCmd),
      [ApplicationCommands.PANE_FOCUS]: buildCommandData(focusPaneCmd),
      [ApplicationCommands.PANE_CLOSE]: buildCommandData(closePaneCmd),
      [ApplicationCommands.PANE_SPLIT_LEFT]: buildCommandData(splitLeftCmd),
      [ApplicationCommands.PANE_SPLIT_RIGHT]: buildCommandData(splitRightCmd),
      [ApplicationCommands.PANE_SPLIT_TOP]: buildCommandData(splitTopCmd),
      [ApplicationCommands.PANE_SPLIT_BOTTOM]: buildCommandData(splitBottomCmd),
      [ApplicationCommands.PANE_SPLIT_LEFT_AGENT]: buildCommandData(splitLeftAgentCmd),
      [ApplicationCommands.PANE_SPLIT_RIGHT_AGENT]: buildCommandData(splitRightAgentCmd),
      [ApplicationCommands.PANE_SPLIT_TOP_AGENT]: buildCommandData(splitTopAgentCmd),
      [ApplicationCommands.PANE_SPLIT_BOTTOM_AGENT]: buildCommandData(splitBottomAgentCmd),
      [ApplicationCommands.PANE_MOVE_LEFT]: buildCommandData(moveLeftCmd),
      [ApplicationCommands.PANE_MOVE_RIGHT]: buildCommandData(moveRightCmd),
      [ApplicationCommands.PANE_MOVE_UP]: buildCommandData(moveUpCmd),
      [ApplicationCommands.PANE_MOVE_DOWN]: buildCommandData(moveDownCmd),
      [ApplicationCommands.PANE_MOVE_TO_TAB]: buildCommandData(moveToTabCmd),
    };
  }, [
    changeTitleCmd,
    duplicateTabCmd,
    duplicateTabWithCwdCmd,
    closeTabCmd,
    focusPaneCmd,
    closePaneCmd,
    splitLeftCmd,
    splitRightCmd,
    splitTopCmd,
    splitBottomCmd,
    splitLeftAgentCmd,
    splitRightAgentCmd,
    splitTopAgentCmd,
    splitBottomAgentCmd,
    moveLeftCmd,
    moveRightCmd,
    moveUpCmd,
    moveDownCmd,
    moveToTabCmd,
  ]);

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
    const unsubscribeContextMenu = api.onContextMenuCommand(
      ({ commandId, tabId, paneId }) => {
        const tab = tabs.find((t) => t.id === tabId);
        if (!tab) {
          return;
        }

        // Resolve the pane ID if needed
        const availablePaneIds = Object.keys(tab.panes);
        const resolvedPaneId =
          (paneId && tab.panes[paneId] ? paneId : undefined) ??
          (tab.activePaneId && tab.panes[tab.activePaneId]
            ? tab.activePaneId
            : undefined) ??
          availablePaneIds[0];

        // Execute the command with tabId and paneId as arguments
        // Commands will use these if provided, otherwise fall back to context
        void executeCommand(commandId, tabId, resolvedPaneId);
      },
    );

    return () => {
      unsubscribeContextMenu();
    };
  }, [api, tabs]);

  return handleContextMenu;
}
