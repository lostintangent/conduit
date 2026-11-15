import type { WebviewTag } from "electron";

/**
 * A browser pane's page. Its webview lives on the body under the pane's id,
 * so it keeps its page as the pane moves between layouts.
 */
export const getWebview = (paneId: string) =>
  document.getElementById(paneId) as WebviewTag | null;

/** New panes whose page takes the keyboard when the pane first shows */
const pagesToFocus = new Set<string>();

/**
 * Has a new pane's page take the keyboard when the pane first shows, since
 * the page the user just opened is what they'll use next.
 */
export const focusPageOnOpen = (paneId: string) => {
  pagesToFocus.add(paneId);
};

/** Whether the pane's page should take the keyboard, which it does once */
export const takePageFocus = (paneId: string) => pagesToFocus.delete(paneId);

/** Panes whose page reopens with its history, which main has set aside */
let pagesToRestore = new Set<string>();

/**
 * Has these panes' pages get their history back as their webviews attach, in
 * place of the panes marked before, which a workspace that opened since
 * replaced.
 */
export const restorePagesOnOpen = (paneIds: string[]) => {
  pagesToRestore = new Set(paneIds);
};

/** Whether the pane's page reopens with its history, which it does once */
export const takePageRestore = (paneId: string) =>
  pagesToRestore.delete(paneId);
