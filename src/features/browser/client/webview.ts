import type { WebviewTag } from "electron";

/**
 * A browser pane's page. Its webview lives on the body under the pane's id,
 * so it keeps its page as the pane moves between layouts.
 */
export const getWebview = (paneId: string) =>
  document.getElementById(paneId) as WebviewTag | null;
