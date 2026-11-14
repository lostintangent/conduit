import { type QueryClient, queryOptions } from "@tanstack/react-query";
import {
  cwdForGitSubscription,
  deserializeGitStatus,
  type GitFileStatus,
  type GitStatus,
  type GitV2API,
} from "./GitV2API";

type ChangedFiles = Map<string, GitFileStatus>;

/**
 * Query keys for a cwd's git data, by the cwd it was subscribed with. The
 * watcher-backed ones are kept current by installGitQueryBridge.
 */
export const gitKeys = {
  all: (cwd: string) => ["git", cwd] as const,
  status: (cwd: string) => [...gitKeys.all(cwd), "status"] as const,
  currentBranch: (cwd: string) =>
    [...gitKeys.all(cwd), "currentBranch"] as const,
  branches: (cwd: string) => [...gitKeys.all(cwd), "branches"] as const,
  root: (cwd: string) => [...gitKeys.all(cwd), "root"] as const,
  diffStats: (cwd: string) => [...gitKeys.all(cwd), "diffStats"] as const,
  perFileDiffStats: (cwd: string) =>
    [...gitKeys.all(cwd), "perFileDiffStats"] as const,
  statusFromBranch: (cwd: string, baseBranch?: string) =>
    baseBranch === undefined
      ? ([...gitKeys.all(cwd), "statusFromBranch"] as const)
      : ([...gitKeys.all(cwd), "statusFromBranch", baseBranch] as const),
};

/** Wait for the watcher before reading, so no change lands in between unseen. */
function read<T>(git: GitV2API, fetch: () => Promise<T>) {
  return async () => {
    await git.whenReady();
    return fetch();
  };
}

/**
 * Trust cached data only if `git`'s watcher has kept it current since it was
 * written. Anything older is shown but re-read on mount, since changes made
 * while nothing was watching never reached it.
 */
function whileWatched(git: GitV2API) {
  return (query: { state: { dataUpdatedAt: number } }) => {
    const since = git.watchedSince;
    return since !== null && query.state.dataUpdatedAt >= since ? Infinity : 0;
  };
}

export const gitQueries = {
  /** HEAD status, or null outside a repository. */
  status: (git: GitV2API) =>
    queryOptions({
      queryKey: gitKeys.status(git.cwd),
      queryFn: read(git, () => git.getStatus()),
      staleTime: whileWatched(git),
    }),

  currentBranch: (git: GitV2API) =>
    queryOptions({
      queryKey: gitKeys.currentBranch(git.cwd),
      queryFn: read(git, () => git.getCurrentBranch()),
      staleTime: whileWatched(git),
    }),

  /**
   * Creating or deleting a branch doesn't fire an event, so this is re-read
   * whenever a picker mounts, showing the last list meanwhile.
   */
  branches: (git: GitV2API) =>
    queryOptions({
      queryKey: gitKeys.branches(git.cwd),
      queryFn: read(git, () => git.getBranches()),
    }),

  /**
   * Re-read on every mount when it's null, since findRoot can fail while the
   * git provider is still starting.
   */
  root: (git: GitV2API) =>
    queryOptions({
      queryKey: gitKeys.root(git.cwd),
      queryFn: read(git, () => git.findRoot()),
      staleTime: (query) => (query.state.data ? Infinity : 0),
    }),

  /** Aggregate lines added and removed. File edits invalidate it too. */
  diffStats: (git: GitV2API) =>
    queryOptions({
      queryKey: gitKeys.diffStats(git.cwd),
      queryFn: read(git, () => git.getUncommittedDiffStats()),
      staleTime: whileWatched(git),
    }),

  /** Lines added and removed per file, split by staged and unstaged. */
  perFileDiffStats: (git: GitV2API) =>
    queryOptions({
      queryKey: gitKeys.perFileDiffStats(git.cwd),
      queryFn: read(git, () => git.getPerFileDiffStats()),
      staleTime: whileWatched(git),
    }),

  /** Status relative to a base branch, overlaid with working tree changes. */
  statusFromBranch: (git: GitV2API, baseBranch: string) =>
    queryOptions({
      queryKey: gitKeys.statusFromBranch(git.cwd, baseBranch),
      queryFn: read(git, () => git.getStatusFromBranch(baseBranch)),
      staleTime: whileWatched(git),
    }),

  /**
   * The changed files to list: HEAD's, or the comparison against baseBranch.
   * Reads the same cache entries as status and statusFromBranch.
   */
  changedFiles: (git: GitV2API, baseBranch: string | null) =>
    queryOptions<GitStatus | ChangedFiles | null, Error, ChangedFiles | null>({
      ...(baseBranch === null
        ? gitQueries.status(git)
        : gitQueries.statusFromBranch(git, baseBranch)),
      select: toChangedFiles,
    }),
};

function toChangedFiles(
  data: GitStatus | ChangedFiles | null,
): ChangedFiles | null {
  return data instanceof Map ? data : (data?.files ?? null);
}

/**
 * Write a status the watcher reported for `cwd`, and re-read what's derived
 * from the working tree but not carried by the event.
 */
export function applyGitStatus(
  queryClient: QueryClient,
  cwd: string,
  status: GitStatus | null,
): void {
  queryClient.setQueryData(gitKeys.status(cwd), status);
  if (status?.branch) {
    queryClient.setQueryData(gitKeys.currentBranch(cwd), status.branch);
  }
  void queryClient.invalidateQueries({
    queryKey: gitKeys.statusFromBranch(cwd),
  });
  void queryClient.invalidateQueries({ queryKey: gitKeys.diffStats(cwd) });
  void queryClient.invalidateQueries({
    queryKey: gitKeys.perFileDiffStats(cwd),
  });
}

/**
 * Write git watcher events into the cache. Call once at startup: a single
 * listener per event routes each one by its subscription id to the cwd
 * GitV2API subscribed with.
 */
export function installGitQueryBridge(queryClient: QueryClient): () => void {
  const cleanups = [
    window.conduit.git.onStatusChanged((payload) => {
      const cwd = cwdForGitSubscription(payload.subscriptionId);
      if (cwd !== undefined) {
        applyGitStatus(queryClient, cwd, deserializeGitStatus(payload.status));
      }
    }),

    window.conduit.git.onBranchChanged((payload) => {
      const cwd = cwdForGitSubscription(payload.subscriptionId);
      if (cwd !== undefined) {
        queryClient.setQueryData(
          gitKeys.currentBranch(cwd),
          payload.currentBranch,
        );
      }
    }),
  ];

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
