/**
 * What commands can do to a browser pane, which keeps its toolbar and page
 * state to itself. Each pane registers its handlers while it's mounted.
 */
export interface BrowserPaneHandlers {
  /** Focuses the address bar and selects it, showing a hidden toolbar */
  focusAddressBar: () => void;
  /** Opens find in the page, or focuses it, with its text selected */
  find: () => void;
  /** Goes to the next match of what find found, opening find if it's closed */
  findNext: () => void;
  /** Goes to the previous match, opening find if it's closed */
  findPrevious: () => void;
}

const registeredHandlers = new Map<string, BrowserPaneHandlers>();

/** Registers a pane's handlers, returning a function that removes them. */
export function registerBrowserPaneHandlers(
  paneId: string,
  handlers: BrowserPaneHandlers,
): () => void {
  registeredHandlers.set(paneId, handlers);

  return () => {
    if (registeredHandlers.get(paneId) === handlers) {
      registeredHandlers.delete(paneId);
    }
  };
}

export const getBrowserPaneHandlers = (paneId: string) =>
  registeredHandlers.get(paneId);
