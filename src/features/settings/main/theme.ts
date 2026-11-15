import { nativeTheme } from "electron";
import type { UserSettings } from "../model";

/**
 * Has native menus, panels and alerts, and the pages in browser panes,
 * follow Conduit's theme rather than the macOS appearance
 */
export function followTheme({ theme }: UserSettings) {
  nativeTheme.themeSource = theme;
}
