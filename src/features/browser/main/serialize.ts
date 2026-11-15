import { webContents } from "electron";
import type {
  BrowserNavigation,
  BrowserPane as SavedBrowserPane,
} from "@shared/types/panes";
import type { BrowserPane } from "@features/workbench/model";
import { parseRestoreAddress } from "../model";

/** How many pages back, and forward, a page's saved history keeps */
export const SAVED_HISTORY_LENGTH = 6;

/**
 * A browser pane as a workspace saves it, with its page's back/forward
 * history, so the page reopens where it was. A page that hasn't attached since
 * it reopened keeps the history it was saved with. A DevTools pane only saves
 * which page it inspects. The page's web contents only last while the app
 * runs.
 */
export function serializeBrowserPane(
  pane: BrowserPane,
  saved?: BrowserNavigation,
): SavedBrowserPane {
  const { webContentsId, ...rest } = pane;
  if (pane.devToolsFor) return rest;

  const navigation = captureNavigation(webContentsId) ?? saved;
  return navigation ? { ...rest, navigation } : rest;
}

function captureNavigation(
  webContentsId: number | undefined,
): BrowserNavigation | undefined {
  const contents =
    webContentsId === undefined ? undefined : webContents.fromId(webContentsId);
  if (!contents || contents.isDestroyed()) return;

  const history = contents.navigationHistory;
  const all = history.getAllEntries();
  const active = all[history.getActiveIndex()];
  // Not the user's pages: one yet to load, DevTools, or a reopening page's
  // start address
  const entries = all.filter(
    ({ url }) =>
      url && !url.startsWith("devtools://") && !parseRestoreAddress(url),
  );
  const index = entries.indexOf(active);
  if (index === -1) return;

  const start = Math.max(0, index - SAVED_HISTORY_LENGTH);
  return {
    index: index - start,
    entries: entries
      .slice(start, index + SAVED_HISTORY_LENGTH + 1)
      .map(({ url, title, pageState }) => ({ url, title, pageState })),
  };
}
