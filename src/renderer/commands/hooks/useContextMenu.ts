import {
  executeCommand,
  getCommandRegistry,
  getContextKeyService,
  getKeybindingRegistry,
  getMenuRegistry,
} from "@/commands";
import { formatKeybindingForElectron } from "@/commands/keybindings/utils";
import { getMenuContextBuilder } from "@/commands/menus/menuContextBuilders";
import { nestSubmenus } from "@/commands/menus/submenuConfig";
import { type ContextMenuAction, MenuId } from "@/commands/menus/types";
import { tabsAtom } from "@features/workbench/client/atoms";
import {
  ApplicationCommands,
  type ContextMenuItemData,
} from "@shared/commands";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useState } from "react";

type UseContextMenuParams = {
  canChangeTitle: (tabId: string) => boolean;
};

const api = window.conduit;

/** What runs for each of the open menu's pane-supplied items, by its id */
const openMenuActions = new Map<string, () => void>();

/**
 * The pane's own items, which run in place, above its usual menu, which
 * moves into a "Pane" submenu
 */
function withPaneSubmenu(
  actions: ContextMenuAction[],
  paneMenu: ContextMenuItemData[],
): ContextMenuItemData[] {
  return [
    ...actions.map(({ run, enabled = true, ...item }, index) => {
      const commandId = `contextMenuAction:${index}`;
      openMenuActions.set(commandId, run);
      return { ...item, commandId, enabled };
    }),
    { title: "Pane", group: "9_pane", submenu: paneMenu },
  ];
}

export function useContextMenu({ canChangeTitle }: UseContextMenuParams) {
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
        const hasRepo = (await api.git.findRoot(cwd)) !== null;
        setHasGitRepoCache((prev) => ({ ...prev, [cwd]: hasRepo }));
        return hasRepo;
      } catch {
        setHasGitRepoCache((prev) => ({ ...prev, [cwd]: false }));
        return false;
      }
    },
    [hasGitRepoCache],
  );

  const handleContextMenu = useCallback(
    async (
      event: MouseEvent,
      tabId: string,
      paneId?: string,
      actions?: ContextMenuAction[],
    ) => {
      event.preventDefault();
      event.stopPropagation();

      const tab = tabsAtom.get().find((t) => t.id === tabId);
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
          return {
            commandId: item.commandId,
            title: item.title || command?.title || item.commandId,
            group: item.group,
            enabled: !command?.when || command.when.evaluate(contextValues),
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

      const menu = nestSubmenus(menuId, menuItemsWithKeybindings);
      openMenuActions.clear();
      api.workbench.showContextMenu({
        tabId,
        paneId,
        menuItems: actions ? withPaneSubmenu(actions, menu) : menu,
      });
    },
    [api, canChangeTitle, checkGitRepo],
  );

  useEffect(() => {
    const unsubscribeContextMenu = api.workbench.on(
      "contextMenuCommand",
      ({ commandId, tabId, paneId }) => {
        const action = openMenuActions.get(commandId);
        if (action) {
          action();
          return;
        }

        const tab = tabsAtom.get().find((t) => t.id === tabId);
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
  }, [api]);

  return handleContextMenu;
}
