import {
  mutationOptions,
  type QueryClient,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";
import type { BrowserLibrary, BrowserPage } from "../model";

/**
 * The pages the user starred and visited. Main owns them, and sends the
 * library whenever the user visits a page, so it's never stale.
 */
export const libraryQuery = queryOptions({
  queryKey: ["browser", "library"] as const,
  queryFn: () => window.conduit.browser.getLibrary(),
  staleTime: Infinity,
  gcTime: Infinity,
});

const emptyLibrary: BrowserLibrary = { favorites: [], history: [] };

/** The part of the library `select` returns, from an empty one until it loads. */
export function useLibrary<Selected>(
  select: (library: BrowserLibrary) => Selected,
): Selected {
  return useQuery({ ...libraryQuery, select }).data ?? select(emptyLibrary);
}

/** Shows the library main sends when the user visits a page. */
export function installLibraryQueryBridge(client: QueryClient): () => void {
  return window.conduit.browser.on("libraryChanged", (library) =>
    client.setQueryData(libraryQuery.queryKey, library),
  );
}

/** A change the user makes, which shows the library main replies with. */
function change<Variables>(
  name: string,
  save: (variables: Variables) => Promise<BrowserLibrary>,
) {
  return () =>
    mutationOptions({
      mutationKey: [...libraryQuery.queryKey, name],
      mutationFn: save,
      meta: { errorMessage: "Couldn't save browser history and favorites" },
      onSuccess: (library, _variables, _onMutateResult, { client }) => {
        client.setQueryData(libraryQuery.queryKey, library);
      },
    });
}

export const libraryMutations = {
  addFavorite: change("addFavorite", (page: BrowserPage) =>
    window.conduit.browser.addFavorite(page),
  ),
  removeFavorite: change("removeFavorite", (url: string) =>
    window.conduit.browser.removeFavorite(url),
  ),
  removeFromHistory: change("removeFromHistory", (url: string) =>
    window.conduit.browser.removeFromHistory(url),
  ),
  clearHistory: change("clearHistory", (_: void) =>
    window.conduit.browser.clearHistory(),
  ),
};
