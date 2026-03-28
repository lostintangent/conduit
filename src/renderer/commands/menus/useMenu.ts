import { useMemo } from "react";
import type { MenuId } from "./types";
import type { MenuRegistry } from "./MenuRegistry";
import type { IContextKeyService } from "../contextKeys/ContextKeyService";
import type { ICommandRegistry } from "../core/CommandRegistry";
import type React from "react";

/**
 * Menu item for rendering
 */
export interface MenuItemData {
  commandId: string;
  title: string;
  group: string;
  icon?: React.ComponentType | string;
  enabled: boolean;
}

/**
 * Hook for rendering a menu
 */
export function useMenu(
  menuId: MenuId,
  menuRegistry: MenuRegistry,
  contextKeyService: IContextKeyService,
  commandRegistry: ICommandRegistry,
): MenuItemData[] {
  return useMemo(() => {
    const items = menuRegistry.getSortedMenuItems(menuId);
    const contextValues = contextKeyService.getAll();

    // Filter items by when clause
    const visibleItems = items.filter((item) => {
      if (!item.when) return true;
      return item.when.evaluate(contextValues);
    });

    // Build menu items with command info
    return visibleItems.map((item) => {
      const command = commandRegistry.getCommand(item.commandId);
      return {
        commandId: item.commandId,
        title: command?.title || item.commandId,
        group: item.group,
        icon: item.icon,
        enabled: !command?.when || command.when.evaluate(contextValues),
      };
    });
  }, [menuId, menuRegistry, contextKeyService, commandRegistry]);
}
