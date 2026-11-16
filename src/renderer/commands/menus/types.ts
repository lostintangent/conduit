import type { WhenClause } from "../whenClauses/WhenClause";
import type { LucideIcon } from "lucide-react";

/**
 * Menu location identifiers
 */
export enum MenuId {
  CommandPalette = "CommandPalette",
  PaneContext = "PaneContext",
  TabContext = "TabContext",
  TitleBar = "TitleBar",
  EditorContext = "EditorContext",
  TerminalContext = "TerminalContext",
  FileTreeContext = "FileTreeContext",
  /** The buttons over the front quick pane */
  QuickPane = "QuickPane",
}

/**
 * Menu contribution descriptor
 */
export interface MenuContribution {
  /** Menu location */
  id: MenuId;

  /**
   * Menu group (controls ordering and separators)
   *
   * Supports hierarchical groups using "/" as a delimiter to create submenus.
   *
   * Examples:
   * - "2_tab" - Top-level group
   * - "2_tab/duplicate_into" - Creates a submenu within the "2_tab" group
   *
   * Submenu labels are configured in submenuConfig.ts
   */
  group?: string;

  /** Order within group (lower numbers first) */
  order?: number;

  /**
   * Title override for this menu item
   * If provided, this title will be shown in the menu instead of the command title.
   * Useful for showing shorter titles in submenus while keeping full titles in the command palette.
   */
  title?: string;

  /** When clause (controls visibility) */
  when?: WhenClause;

  /** Icon, for a menu drawn in the app rather than a native one */
  icon?: LucideIcon;
}

/**
 * Menu item (internal representation)
 */
export interface MenuItem {
  commandId: string;
  menuId: MenuId;
  group: string;
  order: number;
  title?: string;
  when?: WhenClause;
  icon?: LucideIcon;
}

/**
 * An item a pane adds to its right-click menu for what's under the pointer,
 * which runs in place rather than as a registered command
 */
export interface ContextMenuAction {
  title: string;
  group: string;
  enabled?: boolean;
  /** An Electron accelerator, shown beside the title */
  keybinding?: string;
  run: () => void;
}
