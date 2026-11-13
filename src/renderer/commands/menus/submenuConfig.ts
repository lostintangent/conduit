import { MenuId } from "./types";

/**
 * Submenu labels keyed by `${menuId}:${submenuPath}`, where the submenu path
 * is the command's menu group (e.g. "2_tab/duplicate_into").
 */
const submenuLabels: Record<string, string> = {
  [`${MenuId.TabContext}:2_tab/duplicate_into`]: "Duplicate Tab into...",
  [`${MenuId.PaneContext}:3_split_more/1_split_agent_session`]:
    "Split Agent Session...",
  [`${MenuId.PaneContext}:3_split_more/2_split_editor`]: "Split Editor...",
  [`${MenuId.PaneContext}:3_split_more/3_split_browser`]: "Split Browser...",
  [`${MenuId.PaneContext}:3_split_more/4_split_canvas`]: "Split Canvas...",
};

/**
 * Get a submenu label, falling back to the submenu path
 */
export function getSubmenuLabel(menuId: MenuId, submenuPath: string): string {
  return submenuLabels[`${menuId}:${submenuPath}`] || submenuPath;
}
