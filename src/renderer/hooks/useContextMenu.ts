import { executeCommand } from "@/commands";
import {
  getCommandRegistry,
  getContextKeyService,
  getKeybindingRegistry,
  getMenuRegistry,
} from "@/commands";
import type { MenuItemData } from "@/commands/menus/useMenu";
import { MenuId } from "@/commands/menus/types";
import { getMenuContextBuilder } from "@/commands/menus/menuContextBuilders";
import { getSubmenuLabel } from "@/commands/menus/submenuConfig";
import { formatKeybindingForElectron } from "@/commands/keybindings/utils";
import { tabsAtom } from "@/store/atoms";
import { ApplicationCommands } from "@shared/commands";
import { useAtomValue } from "jotai";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useState } from "react";

type UseContextMenuParams = {
  canChangeTitle: (tabId: string) => boolean;
};

const api = window.conduit;

export interface ContextMenuItemData extends MenuItemData {
  keybinding?: string;
}

export function useContextMenu({ canChangeTitle }: UseContextMenuParams) {
  const tabs = useAtomValue(tabsAtom);
  const [hasGitRepoCache, setHasGitRepoCache] = useState<
    Record<string, boolean>
  >({});

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

      // Determine menu ID based on context (tab vs pane)
      const menuId = paneId ? MenuId.PaneContext : MenuId.TabContext;

      // Get registries lazily (only when context menu is triggered)
      const menuRegistry = getMenuRegistry();
      const contextKeyService = getContextKeyService();
      const commandRegistry = getCommandRegistry();
      const keybindingRegistry = getKeybindingRegistry();

      // Get the context builder for this menu
      const contextBuilder = getMenuContextBuilder(menuId);

      // Build menu context (updates context keys)
      if (contextBuilder) {
        const pane = paneId ? tab.panes[paneId] : undefined;
        await contextBuilder(
          contextKeyService,
          {
            tabId,
            paneId,
            tab,
            pane,
            canChangeTitle: allowTitleChange,
          },
          checkGitRepo,
        );
      }

      // Get fresh menu items with updated context
      const menuItems = menuRegistry.getSortedMenuItems(menuId);
      const contextValues = contextKeyService.getAll();

      // Filter by menu when clauses and build menu item data
      const visibleItems = menuItems
        .filter((item) => {
          if (!item.when) return true;
          return item.when.evaluate(contextValues);
        })
        .map((item) => {
          const command = commandRegistry.getCommand(item.commandId);

          // If this is a hierarchical group, look up submenu label from registry
          let submenuLabel: string | undefined;
          if (item.group.includes("/")) {
            submenuLabel = getSubmenuLabel(menuId, item.group);
          }

          return {
            commandId: item.commandId,
            title: item.title || command?.title || item.commandId,
            group: item.group,
            enabled: !command?.when || command.when.evaluate(contextValues),
            submenuLabel,
          };
        });

      // Filter out "Change title" if not allowed
      const filteredItems = visibleItems.filter((item) => {
        if (item.commandId === ApplicationCommands.TAB_RENAME) {
          return allowTitleChange;
        }
        return true;
      });

      // Augment menu items with keybindings
      const menuItemsWithKeybindings: ContextMenuItemData[] = filteredItems.map(
        (item) => {
          const keybindings = keybindingRegistry.getKeybindingsForCommand(
            item.commandId,
          );
          const keybinding = keybindings[0]
            ? formatKeybindingForElectron(keybindings[0].chords)
            : undefined;

          return {
            ...item,
            keybinding,
          };
        },
      );

      api.showContextMenu({
        tabId,
        paneId,
        menuItems: menuItemsWithKeybindings,
      });
    },
    [api, tabs, canChangeTitle, checkGitRepo],
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
