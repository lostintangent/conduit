import type { MenuItem, MenuId, MenuContribution } from "./types";

/**
 * Registry for menu contributions
 */
export class MenuRegistry {
  private items = new Map<MenuId, MenuItem[]>();

  /**
   * Register a menu contribution
   */
  register(commandId: string, contribution: MenuContribution): void {
    const item: MenuItem = {
      commandId,
      menuId: contribution.id,
      group: contribution.group || "default",
      order: contribution.order ?? 0,
      when: contribution.when,
      icon: contribution.icon,
    };

    // Add to registry
    if (!this.items.has(contribution.id)) {
      this.items.set(contribution.id, []);
    }
    this.items.get(contribution.id)!.push(item);
  }

  /**
   * Get all menu items for a specific menu
   */
  getMenuItems(menuId: MenuId): MenuItem[] {
    return this.items.get(menuId) || [];
  }

  /**
   * Get sorted menu items for a specific menu
   * Groups items by group, sorts by order within group
   */
  getSortedMenuItems(menuId: MenuId): MenuItem[] {
    const items = this.getMenuItems(menuId);

    // Sort by group first, then order
    return items.sort((a, b) => {
      if (a.group !== b.group) {
        return a.group.localeCompare(b.group);
      }
      return a.order - b.order;
    });
  }

  /**
   * Unregister all menu items for a command
   */
  unregister(commandId: string): void {
    for (const [menuId, items] of this.items.entries()) {
      this.items.set(
        menuId,
        items.filter((item) => item.commandId !== commandId),
      );
    }
  }

  /**
   * Clear all menu items
   */
  clear(): void {
    this.items.clear();
  }
}
