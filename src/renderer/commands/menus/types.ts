import type { WhenClause } from "../whenClauses/WhenClause";
import type React from "react";

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

  /** Icon (React component or string) */
  icon?: React.ComponentType | string;
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
  icon?: React.ComponentType | string;
}
