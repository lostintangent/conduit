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

  /** Menu group (controls ordering and separators) */
  group?: string;

  /** Order within group (lower numbers first) */
  order?: number;

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
  when?: WhenClause;
  icon?: React.ComponentType | string;
}
