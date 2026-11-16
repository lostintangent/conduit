import {
  getCommandRegistry,
  getContextKeyService,
  getMenuRegistry,
} from "@/commands";
import type { MenuId, MenuItem } from "@/commands/menus/types";
import { useMemo, useSyncExternalStore } from "react";

export interface MenuEntry extends MenuItem {
  title: string;
  enabled: boolean;
}

const subscribe = (onChange: () => void) =>
  getContextKeyService().onDidChangeContext(onChange);
const getContext = () => getContextKeyService().getAll();

/**
 * A menu's items for a menu drawn in the app, like a toolbar. As in a native
 * context menu, an item's `when` shows it and its command's enables it.
 */
export function useMenu(menuId: MenuId): MenuEntry[] {
  const context = useSyncExternalStore(subscribe, getContext);
  return useMemo(() => {
    const commands = getCommandRegistry();
    return getMenuRegistry()
      .getSortedMenuItems(menuId)
      .flatMap((item) => {
        const command = commands.getCommand(item.commandId);
        if (!command || (item.when && !item.when.evaluate(context))) {
          return [];
        }
        return {
          ...item,
          title: item.title ?? command.title,
          enabled: command.when?.evaluate(context) ?? true,
        };
      });
  }, [menuId, context]);
}
