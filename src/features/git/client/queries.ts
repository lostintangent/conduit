import {
  infiniteQueryOptions,
  mutationOptions,
  type QueryClient,
  queryOptions,
} from "@tanstack/react-query";
import {
  type GitFileStatus,
  type GitStatus,
  UNSTAGED_KEY_SUFFIX,
} from "../model";
import { cwdForGitSubscription, type GitSubscription } from "./GitSubscription";

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
  fileAtRef: (cwd: string, ref: string, filePath: string) =>
    [...gitKeys.all(cwd), "fileAtRef", ref, filePath] as const,
};

/** Wait for the watcher before reading, so no change lands in between unseen. */
function read<T>(git: GitSubscription, fetch: (cwd: string) => Promise<T>) {
  return async () => {
    await git.whenReady();
    return fetch(git.cwd);
  };
}

/**
 * Trust cached data only if `git`'s watcher has kept it current since it was
 * written. Anything older is shown but re-read on mount, since changes made
 * while nothing was watching never reached it.
 */
function whileWatched(git: GitSubscription) {
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
  status: (git: GitSubscription) =>
    queryOptions({
      queryKey: gitKeys.status(git.cwd),
      queryFn: read(git, (cwd) => window.conduit.git.getStatus(cwd)),
      staleTime: whileWatched(git),
    }),

  currentBranch: (git: GitSubscription) =>
    queryOptions({
      queryKey: gitKeys.currentBranch(git.cwd),
      queryFn: read(git, (cwd) => window.conduit.git.getCurrentBranch(cwd)),
      staleTime: whileWatched(git),
    }),

  /**
   * Creating or deleting a branch doesn't fire an event, so this is re-read
   * whenever a picker mounts, showing the last list meanwhile.
   */
  branches: (git: GitSubscription) =>
    queryOptions({
      queryKey: gitKeys.branches(git.cwd),
      queryFn: read(git, (cwd) => window.conduit.git.getBranches(cwd)),
    }),

  /**
   * Re-read on every mount when it's null, since findRoot can fail while the
   * git provider is still starting.
   */
  root: (git: GitSubscription) =>
    queryOptions({
      queryKey: gitKeys.root(git.cwd),
      queryFn: read(git, (cwd) => window.conduit.git.findRoot(cwd)),
      staleTime: (query) => (query.state.data ? Infinity : 0),
    }),

  /** Aggregate lines added and removed. File edits invalidate it too. */
  diffStats: (git: GitSubscription) =>
    queryOptions({
      queryKey: gitKeys.diffStats(git.cwd),
      queryFn: read(git, (cwd) =>
        window.conduit.git.getUncommittedDiffStats(cwd),
      ),
      staleTime: whileWatched(git),
    }),

  /** Lines added and removed per file, split by staged and unstaged. */
  perFileDiffStats: (git: GitSubscription) =>
    queryOptions({
      queryKey: gitKeys.perFileDiffStats(git.cwd),
      queryFn: read(git, (cwd) => window.conduit.git.getPerFileDiffStats(cwd)),
      staleTime: whileWatched(git),
    }),

  /** Status relative to a base branch, overlaid with working tree changes. */
  statusFromBranch: (git: GitSubscription, baseBranch: string) =>
    queryOptions({
      queryKey: gitKeys.statusFromBranch(git.cwd, baseBranch),
      queryFn: read(git, (cwd) =>
        window.conduit.git.getStatusFromBranch(cwd, baseBranch),
      ),
      staleTime: whileWatched(git),
    }),

  /**
   * The changed files to list: HEAD's, or the comparison against baseBranch.
   * Reads the same cache entries as status and statusFromBranch.
   */
  changedFiles: (git: GitSubscription, baseBranch: string | null) =>
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
  commitHistory: (git: GitSubscription) =>
    infiniteQueryOptions({
      queryKey: gitKeys.commitHistory(git.cwd),
      queryFn: ({ pageParam }) =>
        read(git, (cwd) =>
          window.conduit.git.getCommitHistory(cwd, {
            limit: COMMIT_PAGE_SIZE,
            skip: pageParam,
          }),
        )(),
      initialPageParam: 0,
      getNextPageParam: (lastPage, pages) =>
        lastPage.hasMore
          ? pages.reduce((count, page) => count + page.commits.length, 0)
          : undefined,
    }),

  /** The refs the commit graph colors by. Invalidated with commitHistory. */
  trackedBranches: (git: GitSubscription) =>
    queryOptions({
      queryKey: gitKeys.trackedBranches(git.cwd),
      queryFn: read(git, (cwd) => window.conduit.git.getTrackedBranches(cwd)),
    }),

  /** A commit, re-read on mount since the refs pointing at it can move. */
  commit: (git: GitSubscription, commitId: string) =>
    queryOptions({
      queryKey: gitKeys.commit(git.cwd, commitId),
      queryFn: () => window.conduit.git.getCommit(git.cwd, commitId),
    }),

  /** The files a commit changed, which never change. */
  commitFiles: (git: GitSubscription, commitId: string) =>
    queryOptions({
      queryKey: gitKeys.commitFiles(git.cwd, commitId),
      queryFn: () => window.conduit.git.getCommitFiles(git.cwd, commitId),
      staleTime: Infinity,
    }),

  /**
   * A file's content at a ref, where "" is the index. Main reads it only once
   * the cwd is watched. It throws when the file or ref isn't there, which
   * callers expect, so that isn't logged. The bridge re-reads open ones when
   * their file's status or their ref moves. Nothing reports some moves (a ref
   * that isn't HEAD's, say), so it's also re-read on every mount and dropped
   * when unused.
   */
  fileAtRef: (git: GitSubscription, filePath: string, ref: string) =>
    queryOptions({
      queryKey: gitKeys.fileAtRef(git.cwd, ref, filePath),
      queryFn: read(git, (cwd) =>
        window.conduit.git.getFileAtRef(cwd, filePath, ref),
      ),
      gcTime: 0,
      meta: { quiet: true },
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
 * They call git by cwd rather than through a pane's GitSubscription, which is
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

/**
 * Re-read the open git sides of `cwd`'s diffs that `moved` picks by ref and
 * file. Each keeps its content until the new read lands, and a read that
 * comes back the same keeps its data, so only diffs that changed redraw.
 */
function refreshFileSides(
  queryClient: QueryClient,
  cwd: string,
  moved: (ref: string, filePath: string) => boolean,
): void {
  void queryClient.invalidateQueries({
    queryKey: [...gitKeys.all(cwd), "fileAtRef"],
    predicate: ({ queryKey }) =>
      moved(String(queryKey[3]), String(queryKey[4])),
  });
}

/** A full commit id, which never moves, as opposed to a branch's name. */
const isCommitId = (ref: string) => /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(ref);

/**
 * Re-read what a branch or HEAD moving changes: the history, and the open
 * diff sides read at a branch rather than at a commit.
 */
function refsMoved(queryClient: QueryClient, cwd: string): void {
  void queryClient.invalidateQueries({ queryKey: gitKeys.commitHistory(cwd) });
  void queryClient.invalidateQueries({
    queryKey: gitKeys.trackedBranches(cwd),
  });
  refreshFileSides(
    queryClient,
    cwd,
    (ref) => ref !== "" && ref !== "HEAD" && !isCommitId(ref),
  );
}

/**
 * The files a status event's delta names. A partially staged file's unstaged
 * entry is keyed with a suffix, which is dropped.
 */
function changedFiles(keys: string[]): string[] {
  return keys.map((key) =>
    key.endsWith(UNSTAGED_KEY_SUFFIX)
      ? key.slice(0, -UNSTAGED_KEY_SUFFIX.length)
      : key,
  );
}

/**
 * Whether `filePath` may be `file`, which is relative to git's root. The root
 * isn't known here, so a file of the same name further down matches too,
 * which costs it a read.
 */
const mayBeFile = (filePath: string, file: string) =>
  filePath === file || filePath.endsWith(`/${file}`);

/**
 * Write git watcher events into the cache. Call once at startup: a single
 * listener per event routes each one by its subscription id to the cwd
 * GitSubscription subscribed with.
 */
export function installGitQueryBridge(queryClient: QueryClient): () => void {
  // A push, pull or publish changes these, and the commit graph shows them.
  // They're compared with the last event rather than the cache, since a status
  // re-read (after publishing, say) can write the change before its event.
  const reportedRefs = new Map<string, string>();

  const { git } = window.conduit;
  const cleanups = [
    git.on("statusChanged", (event) => {
      const cwd = cwdForGitSubscription(event.subscriptionId);
      if (cwd === undefined) return;

      const { status } = event;
      applyGitStatus(queryClient, cwd, status);

      // A file staged, unstaged or reverted changes status, and its index
      // side may have changed with it
      const files = changedFiles([
        ...event.added,
        ...event.modified,
        ...event.removed,
      ]);
      refreshFileSides(
        queryClient,
        cwd,
        (ref, filePath) =>
          ref === "" && files.some((file) => mayBeFile(filePath, file)),
      );

      const refs = [status.ahead, status.behind, status.upstream].join(" ");
      const previous = reportedRefs.get(cwd);
      reportedRefs.set(cwd, refs);
      if (previous !== undefined && previous !== refs) {
        refsMoved(queryClient, cwd);
      }
    }),

    git.on("branchChanged", ({ subscriptionId, currentBranch }) => {
      const cwd = cwdForGitSubscription(subscriptionId);
      if (cwd !== undefined) {
        queryClient.setQueryData(gitKeys.currentBranch(cwd), currentBranch);
        refsMoved(queryClient, cwd);
      }
    }),

    git.on("headChanged", ({ subscriptionId }) => {
      const cwd = cwdForGitSubscription(subscriptionId);
      if (cwd !== undefined) {
        refsMoved(queryClient, cwd);
        // A checkout or reset moves the index with HEAD
        refreshFileSides(
          queryClient,
          cwd,
          (ref) => ref === "HEAD" || ref === "",
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
