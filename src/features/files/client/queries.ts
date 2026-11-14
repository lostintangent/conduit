import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type { DirectoryEntry } from "../model";
import { normalizePathForKey } from "@/utils/pathUtils";

/**
 * How long a listing is trusted without reading it again. Reading a folder
 * makes main re-check it on disk, which is how a folder its watcher ignores
 * (node_modules, say) catches up, but main does that at most every 2s.
 */
const LISTING_STALE_MS = 2000;

/**
 * Query keys for file data. A folder's listing is the same whichever cwd
 * reads it (main caches it by path too), so it's keyed by the folder alone,
 * folding case as paths are compared elsewhere.
 */
export const filesKeys = {
  all: ["files"] as const,
  listing: (dir: string) =>
    [...filesKeys.all, "listing", normalizePathForKey(dir)] as const,
};

export const filesQueries = {
  /**
   * A folder's entries. installFilesQueryBridge keeps it current while a
   * subscription watches its cwd. `dir` keeps its casing, since main caches
   * listings by the exact path.
   */
  listing: (cwd: string, dir: string) =>
    queryOptions({
      queryKey: filesKeys.listing(dir),
      queryFn: () => window.conduit.files.readDirectory(cwd, dir),
      staleTime: LISTING_STALE_MS,
    }),
};

/** Update `dir`'s listing if it's cached, for every tree showing it. */
export function updateListing(
  client: QueryClient,
  dir: string,
  update: (entries: DirectoryEntry[]) => DirectoryEntry[],
): void {
  client.setQueryData<DirectoryEntry[]>(
    filesKeys.listing(dir),
    (entries) => entries && update(entries),
  );
}

/**
 * Write the listings file watchers report into the cache, if they're cached.
 * Call once at startup. A listing is shared by every cwd showing its folder,
 * so events aren't routed by subscription.
 */
export function installFilesQueryBridge(queryClient: QueryClient): () => void {
  return window.conduit.files.on(
    "directoryListingChanged",
    ({ path, entries }) => updateListing(queryClient, path, () => entries),
  );
}
