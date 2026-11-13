import type { ContextKeyService } from "../contextKeys/ContextKeyServiceImpl";
import type { MenuId } from "./types";

/**
 * Parameters passed to menu context builders
 */
export interface MenuContextParams {
  tabId: string;
  paneId?: string;
  tab: any; // Tab type from store
  pane?: any; // Pane type from store
  canChangeTitle: boolean;
}

/**
 * Context builder function for a menu
 *
 * This function is responsible for updating context keys based on the current
 * tab/pane state before the menu is shown.
 *
 * @returns Promise that resolves when context is built
 */
export type MenuContextBuilder = (
  contextKeyService: ContextKeyService,
  params: MenuContextParams,
  checkGitRepo: (cwd: string | null | undefined) => Promise<boolean>,
) => Promise<void>;

/**
 * Registry mapping menu IDs to their context builders
 */
const menuContextBuilders = new Map<MenuId, MenuContextBuilder>();

/**
 * Register a context builder for a menu
 */
export function registerMenuContextBuilder(
  menuId: MenuId,
  builder: MenuContextBuilder,
): void {
  menuContextBuilders.set(menuId, builder);
}

/**
 * Get the context builder for a menu ID
 */
export function getMenuContextBuilder(
  menuId: MenuId,
): MenuContextBuilder | undefined {
  return menuContextBuilders.get(menuId);
}

/**
 * Check if a menu has a registered context builder
 */
export function hasMenuContextBuilder(menuId: MenuId): boolean {
  return menuContextBuilders.has(menuId);
}
