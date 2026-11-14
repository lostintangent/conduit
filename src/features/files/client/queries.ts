import {
  mutationOptions,
  type QueryClient,
  queryOptions,
} from "@tanstack/react-query";
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

/** A path's folder and name. */
function splitPath(path: string): [dir: string, name: string] {
  const slash = path.lastIndexOf("/");
  return [path.slice(0, slash) || "/", path.slice(slash + 1)];
}

function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? dir + name : `${dir}/${name}`;
}

/** Update `dir`'s listing if it's cached. */
function updateListing(
  client: QueryClient,
  dir: string,
  update: (entries: DirectoryEntry[]) => DirectoryEntry[],
): void {
  client.setQueryData<DirectoryEntry[]>(
    filesKeys.listing(dir),
    (entries) => entries && update(entries),
  );
}

/** Notify that a write failed with a message naming what it wrote. */
function failed<Variables>(message: (variables: Variables) => string) {
  return {
    errorMessage: (error: Error, variables: unknown) => ({
      message: message(variables as Variables),
      details: error.message,
    }),
  };
}

type Create = { dir: string; name: string; type: "file" | "folder" };
type Rename = { path: string; name: string };
type Delete = { path: string; recursive: boolean };

/**
 * The file trees' writes, by absolute path. Each updates the cached listing
 * it changed as soon as main replies, so every tree showing that folder
 * shows the change at once, and the watcher's event confirms it after.
 */
export const filesMutations = {
  /** Creates an empty file or a folder, and resolves to its path. */
  create: (cwd: string) =>
    mutationOptions({
      mutationKey: [...filesKeys.all, "create"],
      mutationFn: async ({ dir, name, type }: Create) => {
        const path = joinPath(dir, name);
        await (type === "file"
          ? window.conduit.files.writeFile(cwd, path, new Uint8Array(0))
          : window.conduit.files.createDirectory(cwd, path));
        return path;
      },
      onSuccess: (_path, { dir, name, type }, _onMutateResult, { client }) =>
        updateListing(client, dir, (entries) =>
          entries.some((entry) => entry.name === name)
            ? entries
            : [
                ...entries,
                {
                  name,
                  type: type === "file" ? "file" : "directory",
                  isSymlink: false,
                },
              ],
        ),
      meta: failed<Create>(({ type }) => `Failed to create ${type}`),
    }),

  /** Renames within its folder, and resolves to the new path. */
  rename: (cwd: string) =>
    mutationOptions({
      mutationKey: [...filesKeys.all, "rename"],
      mutationFn: async ({ path, name }: Rename) => {
        const newPath = joinPath(splitPath(path)[0], name);
        await window.conduit.files.rename(cwd, path, newPath);
        return newPath;
      },
      onSuccess: (_newPath, { path, name }, _onMutateResult, { client }) => {
        const [dir, oldName] = splitPath(path);
        updateListing(client, dir, (entries) =>
          entries.map((entry) =>
            entry.name === oldName ? { ...entry, name } : entry,
          ),
        );
      },
      meta: failed<Rename>(
        ({ path }) => `Failed to rename "${splitPath(path)[1]}"`,
      ),
    }),

  delete: (cwd: string) =>
    mutationOptions({
      mutationKey: [...filesKeys.all, "delete"],
      mutationFn: ({ path, recursive }: Delete) =>
        window.conduit.files.delete(cwd, path, { recursive }),
      onSuccess: (_data, { path }, _onMutateResult, { client }) => {
        const [dir, name] = splitPath(path);
        updateListing(client, dir, (entries) =>
          entries.filter((entry) => entry.name !== name),
        );
      },
      meta: failed<Delete>(
        ({ path }) => `Failed to delete "${splitPath(path)[1]}"`,
      ),
    }),
};

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
