import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";

const { send, providers, FakeProvider } = vi.hoisted(() => {
  type Listener = (event: unknown) => void;
  const providers: InstanceType<typeof FakeProvider>[] = [];

  // Stands in for DiskGitProvider, so the real GitProviderService and its pool
  // decide when a provider, and with it the watcher, is disposed.
  class FakeProvider {
    readonly listeners = {
      status: new Set<Listener>(),
      branch: new Set<Listener>(),
      head: new Set<Listener>(),
    };
    startWatching = vi.fn(async () => {});
    dispose = vi.fn();
    getCommitHistory = vi.fn(async () => ({ commits: [], hasMore: false }));
    getCommit = vi.fn(async () => null);
    getCommitFiles = vi.fn(async () => []);
    getTrackedBranches = vi.fn(async () => ({
      current: "main",
      upstream: null,
      base: null,
    }));
    stage = vi.fn(async (_files: string[]) => {});
    commit = vi.fn(async (_message: string) => {});
    onStatusChanged = this.on(this.listeners.status);
    onBranchChanged = this.on(this.listeners.branch);
    onHeadChanged = this.on(this.listeners.head);

    constructor(readonly gitRoot: string) {
      providers.push(this);
    }

    fire(kind: keyof FakeProvider["listeners"], event: unknown) {
      for (const listener of this.listeners[kind]) listener(event);
    }

    private on(set: Set<Listener>) {
      return (listener: Listener) => {
        set.add(listener);
        return { dispose: () => set.delete(listener) };
      };
    }
  }

  return { send: vi.fn(), providers, FakeProvider };
});

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [{ webContents: { send } }] },
}));
vi.mock("./DiskGitProvider", () => ({ DiskGitProvider: FakeProvider }));

import { GitProviderService } from "./GitProviderService";
import service, { releaseGitSubscriptions } from "./service";

const root = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), "git-service-")),
);
const repo = path.join(root, "repo");
const outside = path.join(root, "outside");
fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
fs.mkdirSync(path.join(repo, "src"));
fs.mkdirSync(outside);

const status = {
  branch: "main",
  ahead: 0,
  behind: 0,
  files: new Map([["a.ts", { path: "a.ts", status: "modified" }]]),
};

/** Past the pool's grace period, when a provider nothing holds is disposed. */
const afterGrace = () => vi.advanceTimersByTimeAsync(5000);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  releaseGitSubscriptions();
  GitProviderService.resetInstance();
  providers.length = 0;
  vi.clearAllMocks();
  vi.useRealTimers();
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

it("sends its provider's events with the subscription's id until unsubscribed", async () => {
  const id = await service.subscribe(path.join(repo, "src"));
  const [provider] = providers;
  expect(provider.gitRoot).toBe(repo);

  provider.fire("status", {
    status,
    added: ["a.ts"],
    modified: [],
    removed: [],
  });
  provider.fire("branch", { previousBranch: "main", currentBranch: "feature" });
  provider.fire("head", {
    previousHead: "a",
    currentHead: "b",
    isBranchSwitch: true,
  });

  expect(send.mock.calls).toEqual([
    [
      "git:statusChanged",
      {
        subscriptionId: id,
        status,
        added: ["a.ts"],
        modified: [],
        removed: [],
      },
    ],
    [
      "git:branchChanged",
      { subscriptionId: id, previousBranch: "main", currentBranch: "feature" },
    ],
    [
      "git:headChanged",
      {
        subscriptionId: id,
        previousHead: "a",
        currentHead: "b",
        isBranchSwitch: true,
      },
    ],
  ]);
  expect(send.mock.calls[0][1].status).toBe(status);

  service.unsubscribe(id!);
  service.unsubscribe(id!);
  provider.fire("status", { status, added: [], modified: [], removed: [] });
  await afterGrace();

  expect(send).toHaveBeenCalledTimes(3);
  expect(provider.dispose).toHaveBeenCalledTimes(1);
});

it("releases every subscription when the page that made them goes away", async () => {
  await service.subscribe(repo);
  await service.subscribe(path.join(repo, "src"));
  expect(providers).toHaveLength(1);

  releaseGitSubscriptions();
  providers[0].fire("status", { status, added: [], modified: [], removed: [] });
  await afterGrace();

  expect(send).not.toHaveBeenCalled();
  expect(providers[0].dispose).toHaveBeenCalledTimes(1);
});

it("lets the repository's watcher go once its commit graph closes", async () => {
  const id = await service.subscribe(repo);
  await service.getCommitHistory(repo, { limit: 50 });
  await service.getTrackedBranches(repo);
  await service.getCommit(repo, "abc");
  await service.getCommitFiles(repo, "abc");

  service.unsubscribe(id!);
  await afterGrace();

  expect(providers).toHaveLength(1);
  expect(providers[0].getCommitHistory).toHaveBeenCalledWith({ limit: 50 });
  expect(providers[0].dispose).toHaveBeenCalledTimes(1);
});

it("reads history before anything subscribes, then lets that watcher go", async () => {
  await expect(service.getCommitHistory(repo)).resolves.toEqual({
    commits: [],
    hasMore: false,
  });
  expect(providers[0].startWatching).toHaveBeenCalled();

  await afterGrace();

  expect(providers[0].dispose).toHaveBeenCalledTimes(1);
});

it("subscribes to nothing, and fails writes, outside a repository", async () => {
  await expect(service.subscribe(outside)).resolves.toBeNull();
  await expect(service.getCommitHistory(outside)).resolves.toEqual({
    commits: [],
    hasMore: false,
  });
  await expect(service.stage(outside, ["a.ts"])).rejects.toThrow(
    `Not a git repository: ${outside}`,
  );
  expect(providers).toHaveLength(0);
});

it("lands a write that nothing else holds a provider for", async () => {
  await service.stage(repo, ["a.ts"]);
  expect(providers[0].stage).toHaveBeenCalledWith(["a.ts"]);

  await afterGrace();

  expect(providers[0].dispose).toHaveBeenCalledTimes(1);
});

it("holds the provider until a write is done, once nothing else does", async () => {
  const id = await service.subscribe(repo);
  const started = deferred();
  const done = deferred();
  providers[0].commit.mockImplementationOnce(() => {
    started.resolve();
    return done.promise;
  });
  const commit = service.commit(repo, "Slow commit");
  await started.promise;

  service.unsubscribe(id!);
  await afterGrace();
  expect(providers[0].dispose).not.toHaveBeenCalled();

  done.resolve();
  await commit;
  await afterGrace();
  expect(providers[0].dispose).toHaveBeenCalledTimes(1);
});

it("falls back to empty reads without a provider", async () => {
  await expect(service.getStatus(repo)).resolves.toBeNull();
  await expect(service.getStatusFromBranch(repo, "main")).resolves.toEqual(
    new Map(),
  );
  await expect(service.getPerFileDiffStats(repo)).resolves.toEqual({
    staged: new Map(),
    unstaged: new Map(),
  });
  expect(providers).toHaveLength(0);
});
