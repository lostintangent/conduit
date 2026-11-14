import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGit, emit } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const on = (channel: string) =>
    vi.fn((listener: (payload: unknown) => void) => {
      const channelListeners = listeners.get(channel) ?? new Set();
      listeners.set(channel, channelListeners);
      channelListeners.add(listener);
      return () => channelListeners.delete(listener);
    });

  const git = {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    findRoot: vi.fn(),
    getStatus: vi.fn(),
    getStatusFromBranch: vi.fn(),
    getUncommittedDiffStats: vi.fn(),
    getPerFileDiffStats: vi.fn(),
    onStatusChanged: on("status"),
    onBranchChanged: on("branch"),
    onCommitCreated: on("commit"),
    onHeadChanged: on("head"),
  };
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).window.conduit = { git };

  return {
    mockGit: git,
    emit: (channel: "status" | "branch", payload: unknown) => {
      for (const listener of listeners.get(channel) ?? []) listener(payload);
    },
  };
});

import { GitV2API } from "@/api/GitV2API";
import { gitKeys, gitQueries, installGitQueryBridge } from "@/api/gitQueries";
import { createQueryClient } from "@/query";
import { keepPreviousData, QueryObserver } from "@tanstack/react-query";

const serializedStatus = (branch: string, files: string[] = []) => ({
  branch,
  upstream: `origin/${branch}`,
  ahead: 0,
  behind: 0,
  files: Object.fromEntries(
    files.map((path) => [path, { path, status: "modified", staged: false }]),
  ),
});

const statusEvent = (subscriptionId: string, branch: string) => ({
  subscriptionId,
  gitRoot: "/repo",
  status: serializedStatus(branch, ["changed.ts"]),
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
  mockGit.getStatus.mockResolvedValue(serializedStatus("main"));
  mockGit.getStatusFromBranch.mockResolvedValue({});
  mockGit.getUncommittedDiffStats.mockResolvedValue({
    added: 1,
    removed: 0,
    files: 1,
  });
  mockGit.getPerFileDiffStats.mockResolvedValue({ staged: {}, unstaged: {} });
});

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

    emit("status", statusEvent("sub-2", "feature"));

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

    emit("branch", {
      subscriptionId: "sub-1",
      gitRoot: "/repo",
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

    emit("status", statusEvent("sub-1", "feature"));

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

    emit("status", statusEvent("sub-1", "main"));

    await vi.waitFor(() => {
      expect(mockGit.getStatusFromBranch).toHaveBeenCalledTimes(2);
      expect(mockGit.getUncommittedDiffStats).toHaveBeenCalledTimes(2);
      expect(mockGit.getPerFileDiffStats).toHaveBeenCalledTimes(2);
    });
    for (const unsubscribe of unsubscribes) unsubscribe();
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
    mockGit.getStatus.mockResolvedValue(serializedStatus("main", ["head.ts"]));
    const comparisons = new Map<string, (files: object) => void>();
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
    comparisons.get("a")!({ "a.ts": { path: "a.ts", status: "added" } });
    await vi.waitFor(() => expect(files()).toEqual(["a.ts"]));

    observer.setOptions(listed("b"));
    expect(files()).toEqual(["a.ts"]);

    observer.setOptions(listed(null));
    expect(files()).toEqual(["head.ts"]);
    unsubscribe();
  });
});
