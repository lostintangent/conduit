import {
  infiniteQueryOptions,
  mutationOptions,
  type QueryClient,
  queryOptions,
} from "@tanstack/react-query";
import type { GitFileStatus, GitStatus } from "../model";
import { cwdForGitSubscription, type GitV2API } from "./GitV2API";

type ChangedFiles = Map<string, GitFileStatus>;

const COMMIT_PAGE_SIZE = 50;

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
  commitHistory: (cwd: string) =>
    [...gitKeys.all(cwd), "commitHistory"] as const,
  trackedBranches: (cwd: string) =>
    [...gitKeys.all(cwd), "trackedBranches"] as const,
  commit: (cwd: string, commitId: string) =>
    [...gitKeys.all(cwd), "commit", commitId] as const,
  commitFiles: (cwd: string, commitId: string) =>
    [...gitKeys.all(cwd), "commitFiles", commitId] as const,
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
  /** Whether git runs at all, which main checks once. */
  available: queryOptions({
    queryKey: ["git-available"],
    queryFn: () => window.conduit.git.isGitAvailable(),
    staleTime: Infinity,
  }),

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

  /**
   * History in pages, newest first. HEAD, branch, ahead/behind and upstream
   * changes invalidate it. Refs that move without any of those, like a base
   * branch fetched, fire nothing, so it's also re-read on mount.
   */
  commitHistory: (git: GitV2API) =>
    infiniteQueryOptions({
      queryKey: gitKeys.commitHistory(git.cwd),
      queryFn: ({ pageParam }) =>
        read(git, () =>
          git.getCommitHistory({ limit: COMMIT_PAGE_SIZE, skip: pageParam }),
        )(),
      initialPageParam: 0,
      getNextPageParam: (lastPage, pages) =>
        lastPage.hasMore
          ? pages.reduce((count, page) => count + page.commits.length, 0)
          : undefined,
    }),

  /** The refs the commit graph colors by. Invalidated with commitHistory. */
  trackedBranches: (git: GitV2API) =>
    queryOptions({
      queryKey: gitKeys.trackedBranches(git.cwd),
      queryFn: read(git, () => git.getTrackedBranches()),
    }),

  /** A commit, re-read on mount since the refs pointing at it can move. */
  commit: (git: GitV2API, commitId: string) =>
    queryOptions({
      queryKey: gitKeys.commit(git.cwd, commitId),
      queryFn: () => git.getCommit(commitId),
    }),

  /** The files a commit changed, which never change. */
  commitFiles: (git: GitV2API, commitId: string) =>
    queryOptions({
      queryKey: gitKeys.commitFiles(git.cwd, commitId),
      queryFn: () => git.getCommitFiles(commitId),
      staleTime: Infinity,
    }),
};

function toChangedFiles(
  data: GitStatus | ChangedFiles | null,
): ChangedFiles | null {
  return data instanceof Map ? data : (data?.files ?? null);
}

/**
 * Key a write under its cwd's queries, so any component can show it pending,
 * and queue it in `scope`, so a scope's writes run one at a time in the order
 * they were made.
 */
function write(cwd: string, name: string, scope = `git:${cwd}`) {
  return {
    mutationKey: [...gitKeys.all(cwd), name],
    scope: { id: scope },
  };
}

/**
 * A cwd's git writes. Those that change its working tree, index or branch
 * share a scope. Push only sends commits, so it has its own, and a slow remote
 * doesn't hold up staging.
 *
 * They call git by cwd rather than through a pane's GitV2API, which is
 * released after its pane closes, so a write queued behind a slow one still
 * lands. The watcher's next event updates the cache, so they don't on success.
 */
export const gitMutations = {
  stage: (cwd: string) =>
    mutationOptions({
      ...write(cwd, "stage"),
      mutationFn: (files: string[]) => window.conduit.git.stage(cwd, files),
    }),

  unstage: (cwd: string) =>
    mutationOptions({
      ...write(cwd, "unstage"),
      mutationFn: (files: string[]) => window.conduit.git.unstage(cwd, files),
    }),

  revert: (cwd: string) =>
    mutationOptions({
      ...write(cwd, "revert"),
      mutationFn: (files: string[]) => window.conduit.git.revert(cwd, files),
    }),

  commit: (cwd: string) =>
    mutationOptions({
      ...write(cwd, "commit"),
      mutationFn: (message: string) => window.conduit.git.commit(cwd, message),
    }),

  pull: (cwd: string) =>
    mutationOptions({
      ...write(cwd, "pull"),
      mutationFn: () => window.conduit.git.pull(cwd),
    }),

  /** Publishing pushes a branch with no upstream and tracks it. */
  push: (cwd: string) =>
    mutationOptions({
      ...write(cwd, "push", `git-remote:${cwd}`),
      mutationFn: ({ publish }: { publish: boolean }) =>
        window.conduit.git.push(cwd, false, publish),
      onSuccess: (_data, { publish }, _onMutateResult, { client }) => {
        if (publish) {
          void client.invalidateQueries({ queryKey: gitKeys.status(cwd) });
        }
      },
    }),

  /**
   * Switch branches. Checkout fails when it would overwrite local changes,
   * unless they're stashed and reapplied on the new branch, or discarded.
   */
  checkout: (cwd: string) =>
    mutationOptions({
      ...write(cwd, "checkout"),
      mutationFn: async ({
        branch,
        localChanges,
      }: {
        branch: string;
        localChanges?: "stash" | "discard";
      }) => {
        const { git } = window.conduit;
        if (localChanges !== "stash") {
          return git.checkout(cwd, branch, localChanges === "discard");
        }
        await git.stash(cwd, `Auto-stash before switching to ${branch}`);
        await git.checkout(cwd, branch);
        // Conflicts are left in the working tree to resolve
        await git.stashPop(cwd).catch((error: unknown) => {
          console.warn("Stash pop had conflicts:", error);
        });
      },
    }),

  /**
   * Create a branch and switch to it. Pickers re-read the branch list when
   * they open, so it isn't invalidated.
   */
  createBranch: (cwd: string) =>
    mutationOptions({
      ...write(cwd, "createBranch"),
      mutationFn: (name: string) => window.conduit.git.createBranch(cwd, name),
    }),
};

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

function invalidateHistory(queryClient: QueryClient, cwd: string): void {
  void queryClient.invalidateQueries({ queryKey: gitKeys.commitHistory(cwd) });
  void queryClient.invalidateQueries({
    queryKey: gitKeys.trackedBranches(cwd),
  });
}

/**
 * Write git watcher events into the cache. Call once at startup: a single
 * listener per event routes each one by its subscription id to the cwd
 * GitV2API subscribed with.
 */
export function installGitQueryBridge(queryClient: QueryClient): () => void {
  // A push, pull or publish changes these, and the commit graph shows them.
  // They're compared with the last event rather than the cache, since a status
  // re-read (after publishing, say) can write the change before its event.
  const reportedRefs = new Map<string, string>();

  const { git } = window.conduit;
  const cleanups = [
    git.on("statusChanged", ({ subscriptionId, status }) => {
      const cwd = cwdForGitSubscription(subscriptionId);
      if (cwd === undefined) return;

      applyGitStatus(queryClient, cwd, status);

      const refs = [status.ahead, status.behind, status.upstream].join(" ");
      const previous = reportedRefs.get(cwd);
      reportedRefs.set(cwd, refs);
      if (previous !== undefined && previous !== refs) {
        invalidateHistory(queryClient, cwd);
      }
    }),

    git.on("branchChanged", ({ subscriptionId, currentBranch }) => {
      const cwd = cwdForGitSubscription(subscriptionId);
      if (cwd !== undefined) {
        queryClient.setQueryData(gitKeys.currentBranch(cwd), currentBranch);
        invalidateHistory(queryClient, cwd);
      }
    }),

    git.on("headChanged", ({ subscriptionId }) => {
      const cwd = cwdForGitSubscription(subscriptionId);
      if (cwd !== undefined) {
        invalidateHistory(queryClient, cwd);
      }
    }),
  ];

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}
