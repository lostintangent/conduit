import { MenuId } from "./types";

/**
 * Registry for submenu labels
 * Similar to menu context builders, this allows registering submenu labels
 * separately from the commands that appear in them.
 */
class SubmenuRegistry {
  private labels = new Map<string, string>();

  /**
   * Register a submenu label for a given menu and submenu path
   *
   * @param menuId - The menu location (e.g., MenuId.TabContext)
   * @param submenuPath - The submenu path after the "/" (e.g., "2_tab/duplicate_into")
   * @param label - The display label for the submenu (e.g., "Duplicate Tab into...")
   */
  register(menuId: MenuId, submenuPath: string, label: string): void {
    const key = `${menuId}:${submenuPath}`;
    this.labels.set(key, label);
  }

  /**
   * Get the submenu label for a given menu ID and submenu path
   * Returns the submenu path as fallback if no label is registered
   */
  getLabel(menuId: MenuId, submenuPath: string): string {
    const key = `${menuId}:${submenuPath}`;
    return this.labels.get(key) || submenuPath;
  }

  /**
   * Clear all registered submenu labels
   */
  clear(): void {
    this.labels.clear();
  }
}

// Singleton instance
let submenuRegistry: SubmenuRegistry | null = null;

/**
 * Get the global submenu registry instance
 */
export function getSubmenuRegistry(): SubmenuRegistry {
  if (!submenuRegistry) {
    submenuRegistry = new SubmenuRegistry();
  }
  return submenuRegistry;
}

/**
 * Register a submenu label
 * Convenience function that uses the singleton registry
 */
export function registerSubmenu(
  menuId: MenuId,
  submenuPath: string,
  label: string,
): void {
  getSubmenuRegistry().register(menuId, submenuPath, label);
}

/**
 * Get a submenu label
 * Convenience function that uses the singleton registry
 */
export function getSubmenuLabel(menuId: MenuId, submenuPath: string): string {
  return getSubmenuRegistry().getLabel(menuId, submenuPath);
}
