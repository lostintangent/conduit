import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGit, emit } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  const git = {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    findRoot: vi.fn(),
    getStatus: vi.fn(),
    getStatusFromBranch: vi.fn(),
    getUncommittedDiffStats: vi.fn(),
    getPerFileDiffStats: vi.fn(),
    getCommitHistory: vi.fn(),
    getTrackedBranches: vi.fn(),
    on: vi.fn((event: string, listener: (payload: unknown) => void) => {
      const eventListeners = listeners.get(event) ?? new Set();
      listeners.set(event, eventListeners);
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    }),
  };
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).window.conduit = { git };

  return {
    mockGit: git,
    emit: (
      event: "statusChanged" | "branchChanged" | "headChanged",
      payload: unknown,
    ) => {
      for (const listener of listeners.get(event) ?? []) listener(payload);
    },
  };
});

import { GitV2API } from "./GitV2API";
import {
  gitKeys,
  gitMutations,
  gitQueries,
  installGitQueryBridge,
} from "./queries";
import { createQueryClient } from "@/query";
import {
  InfiniteQueryObserver,
  keepPreviousData,
  MutationObserver,
  QueryClient,
  QueryObserver,
} from "@tanstack/react-query";
import { mockGitWrites } from "../../../../tests/renderer/gitWrites";

const gitStatus = (branch: string, files: string[] = []) => ({
  branch,
  upstream: `origin/${branch}`,
  ahead: 0,
  behind: 0,
  files: new Map(
    files.map((path) => [path, { path, status: "modified", staged: false }]),
  ),
});

const statusEvent = (
  subscriptionId: string,
  branch: string,
  overrides: { ahead?: number; upstream?: string } = {},
) => ({
  subscriptionId,
  status: { ...gitStatus(branch, ["changed.ts"]), ...overrides },
  added: ["changed.ts"],
  modified: [] as string[],
  removed: [] as string[],
});

const created: GitV2API[] = [];
async function watch(cwd: string) {
  const git = new GitV2API(cwd);
  created.push(git);
  await git.whenReady();
  return git;
}

let uninstall: () => void;
let nextSubscription = 0;

beforeEach(() => {
  vi.clearAllMocks();
  nextSubscription = 0;
  mockGit.subscribe.mockImplementation(async () => `sub-${++nextSubscription}`);
  mockGit.unsubscribe.mockResolvedValue(undefined);
  mockGit.findRoot.mockResolvedValue("/repo");
  mockGit.getStatus.mockResolvedValue(gitStatus("main"));
  mockGit.getStatusFromBranch.mockResolvedValue(new Map());
  mockGit.getUncommittedDiffStats.mockResolvedValue({
    added: 1,
    removed: 0,
    files: 1,
  });
  mockGit.getPerFileDiffStats.mockResolvedValue({
    staged: new Map(),
    unstaged: new Map(),
  });
  mockGit.getCommitHistory.mockResolvedValue({ commits: [], hasMore: false });
  mockGit.getTrackedBranches.mockResolvedValue({});
});

/** Observe the commit graph's queries, resolving once both have loaded. */
async function observeHistory(queryClient: QueryClient, git: GitV2API) {
  const observers = [
    new InfiniteQueryObserver(queryClient, gitQueries.commitHistory(git)),
    new QueryObserver(queryClient, gitQueries.trackedBranches(git)),
  ];
  const unsubscribes = observers.map((observer) =>
    observer.subscribe(() => {}),
  );
  await vi.waitFor(() => {
    expect(mockGit.getCommitHistory).toHaveBeenCalledTimes(1);
    expect(mockGit.getTrackedBranches).toHaveBeenCalledTimes(1);
  });
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

afterEach(() => {
  uninstall?.();
  for (const git of created.splice(0)) git.release();
  vi.restoreAllMocks();
});

describe("installGitQueryBridge", () => {
  it("writes each status event to the cwd that subscribed, without re-reading", async () => {
    const queryClient = createQueryClient();
    uninstall = installGitQueryBridge(queryClient);
    await watch("/repo/a");
    const b = await watch("/repo/b");

    emit("statusChanged", statusEvent("sub-2", "feature"));

    const status = queryClient.getQueryData(gitQueries.status(b).queryKey);
    expect(status?.branch).toBe("feature");
    expect([...(status?.files.keys() ?? [])]).toEqual(["changed.ts"]);
    expect(queryClient.getQueryData(gitKeys.currentBranch("/repo/b"))).toBe(
      "feature",
    );
    expect(queryClient.getQueryData(gitKeys.status("/repo/a"))).toBeUndefined();
    expect(mockGit.getStatus).not.toHaveBeenCalled();
  });

  it("writes the current branch from branch events", async () => {
    const queryClient = createQueryClient();
    uninstall = installGitQueryBridge(queryClient);
    await watch("/repo");

    emit("branchChanged", {
      subscriptionId: "sub-1",
      previousBranch: "main",
      currentBranch: "feature",
    });

    expect(queryClient.getQueryData(gitKeys.currentBranch("/repo"))).toBe(
      "feature",
    );
  });

  it("ignores events for released subscriptions", async () => {
    const queryClient = createQueryClient();
    uninstall = installGitQueryBridge(queryClient);
    const git = await watch("/repo");
    git.release();

    emit("statusChanged", statusEvent("sub-1", "feature"));

    expect(queryClient.getQueryData(gitKeys.status("/repo"))).toBeUndefined();
  });

  it("re-reads the observed comparison and diff stats when status changes", async () => {
    const queryClient = createQueryClient();
    uninstall = installGitQueryBridge(queryClient);
    const git = await watch("/repo");
    const observers = [
      new QueryObserver(queryClient, gitQueries.statusFromBranch(git, "main")),
      new QueryObserver(queryClient, gitQueries.diffStats(git)),
      new QueryObserver(queryClient, gitQueries.perFileDiffStats(git)),
    ];
    const unsubscribes = observers.map((observer) =>
      observer.subscribe(() => {}),
    );
    await vi.waitFor(() => {
      expect(mockGit.getStatusFromBranch).toHaveBeenCalledTimes(1);
      expect(mockGit.getUncommittedDiffStats).toHaveBeenCalledTimes(1);
      expect(mockGit.getPerFileDiffStats).toHaveBeenCalledTimes(1);
    });

    emit("statusChanged", statusEvent("sub-1", "main"));

    await vi.waitFor(() => {
      expect(mockGit.getStatusFromBranch).toHaveBeenCalledTimes(2);
      expect(mockGit.getUncommittedDiffStats).toHaveBeenCalledTimes(2);
      expect(mockGit.getPerFileDiffStats).toHaveBeenCalledTimes(2);
    });
    for (const unsubscribe of unsubscribes) unsubscribe();
  });

  it.each([
    [
      "headChanged",
      { previousHead: "a", currentHead: "b", isBranchSwitch: false },
    ],
    ["branchChanged", { previousBranch: "main", currentBranch: "feature" }],
  ] as const)(
    "re-reads the observed commit history on %s",
    async (event, payload) => {
      const queryClient = createQueryClient();
      uninstall = installGitQueryBridge(queryClient);
      const git = await watch("/repo");
      const unobserve = await observeHistory(queryClient, git);

      emit(event, { subscriptionId: "sub-1", ...payload });

      await vi.waitFor(() => {
        expect(mockGit.getCommitHistory).toHaveBeenCalledTimes(2);
        expect(mockGit.getTrackedBranches).toHaveBeenCalledTimes(2);
      });
      unobserve();
    },
  );

  it("re-reads the commit history only when ahead, behind or upstream changes from the last event", async () => {
    const queryClient = createQueryClient();
    uninstall = installGitQueryBridge(queryClient);
    const git = await watch("/repo");
    const unobserve = await observeHistory(queryClient, git);

    emit("statusChanged", statusEvent("sub-1", "main"));
    emit("statusChanged", statusEvent("sub-1", "main"));
    expect(queryClient.isFetching()).toBe(0);
    expect(mockGit.getCommitHistory).toHaveBeenCalledTimes(1);

    emit("statusChanged", statusEvent("sub-1", "main", { ahead: 1 }));
    await vi.waitFor(() =>
      expect(mockGit.getCommitHistory).toHaveBeenCalledTimes(2),
    );

    // Publishing re-reads status, so the cache sees the upstream before the event
    queryClient.setQueryData(gitKeys.status("/repo"), {
      ...queryClient.getQueryData(gitKeys.status("/repo"))!,
      upstream: "origin/published",
    });
    emit(
      "statusChanged",
      statusEvent("sub-1", "main", { ahead: 1, upstream: "origin/published" }),
    );
    await vi.waitFor(() =>
      expect(mockGit.getCommitHistory).toHaveBeenCalledTimes(3),
    );
    unobserve();
  });
});

describe("gitQueries", () => {
  it("trusts cached git data only while the watcher that kept it is alive", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const queryClient = createQueryClient();
    const first = await watch("/repo");
    await queryClient.fetchQuery(gitQueries.status(first));

    const whileWatched = new QueryObserver(
      queryClient,
      gitQueries.status(first),
    );
    expect(whileWatched.getCurrentResult().isStale).toBe(false);

    first.release();
    now.mockReturnValue(2_000);
    const second = await watch("/repo");
    const afterRestart = new QueryObserver(
      queryClient,
      gitQueries.status(second),
    );
    expect(afterRestart.getCurrentResult()).toMatchObject({
      isStale: true,
      data: { branch: "main" },
    });
  });

  it("keeps the last changed files listed until the next comparison loads", async () => {
    const queryClient = createQueryClient();
    const git = await watch("/repo");
    mockGit.getStatus.mockResolvedValue(gitStatus("main", ["head.ts"]));
    const comparisons = new Map<string, (files: Map<string, object>) => void>();
    mockGit.getStatusFromBranch.mockImplementation(
      (_cwd: string, base: string) =>
        new Promise((resolve) => comparisons.set(base, resolve)),
    );
    const listed = (baseBranch: string | null) => ({
      ...gitQueries.changedFiles(git, baseBranch),
      placeholderData: keepPreviousData,
    });
    const observer = new QueryObserver(queryClient, listed(null));
    const unsubscribe = observer.subscribe(() => {});
    const files = () => [...(observer.getCurrentResult().data?.keys() ?? [])];
    await vi.waitFor(() => expect(files()).toEqual(["head.ts"]));

    observer.setOptions(listed("a"));
    expect(files()).toEqual(["head.ts"]);
    await vi.waitFor(() => expect(comparisons.has("a")).toBe(true));
    comparisons.get("a")!(
      new Map([["a.ts", { path: "a.ts", status: "added" }]]),
    );
    await vi.waitFor(() => expect(files()).toEqual(["a.ts"]));

    observer.setOptions(listed("b"));
    expect(files()).toEqual(["a.ts"]);

    observer.setOptions(listed(null));
    expect(files()).toEqual(["head.ts"]);
    unsubscribe();
  });
});

describe("gitMutations", () => {
  it("lands a write queued behind a slow one after the pane that made it closes", async () => {
    const writes = mockGitWrites();
    let finishCommit!: () => void;
    writes.commit.mockReturnValueOnce(
      new Promise<void>((resolve) => (finishCommit = resolve)),
    );
    const queryClient = createQueryClient();
    const git = await watch("/repo");
    const commit = new MutationObserver(
      queryClient,
      gitMutations.commit(git.cwd),
    );
    const stage = new MutationObserver(
      queryClient,
      gitMutations.stage(git.cwd),
    );

    const writing = Promise.all([
      commit.mutate("Fix bug"),
      stage.mutate(["a.ts"]),
    ]);
    // Its pane closed, so the pool released its API before the commit ended
    git.release();
    finishCommit();

    await writing;
    expect(writes.stage).toHaveBeenCalledWith("/repo", ["a.ts"]);
  });
});
