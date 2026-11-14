import { afterEach, expect, it, vi } from "vitest";

const { send, providers, fire } = vi.hoisted(() => {
  type Listener = (event: unknown) => void;
  const listeners = {
    status: new Set<Listener>(),
    branch: new Set<Listener>(),
    head: new Set<Listener>(),
  };
  const on = (set: Set<Listener>) => (listener: Listener) => {
    set.add(listener);
    return { dispose: () => set.delete(listener) };
  };
  const provider = {
    onStatusChanged: on(listeners.status),
    onBranchChanged: on(listeners.branch),
    onHeadChanged: on(listeners.head),
  };

  return {
    send: vi.fn(),
    providers: {
      getProvider: vi.fn(async (_cwd: string) => ({
        provider,
        gitRoot: "/repo",
      })),
      getExistingProviderByCwd: vi.fn(async (_cwd: string) => null),
      releaseProvider: vi.fn(),
    },
    fire: (kind: keyof typeof listeners, event: unknown) => {
      for (const listener of listeners[kind]) listener(event);
    },
  };
});

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [{ webContents: { send } }] },
}));
vi.mock("./GitProviderService", () => ({
  GitProviderService: { getInstance: () => providers },
}));

import service, { releaseGitSubscriptions } from "./service";

const status = {
  branch: "main",
  ahead: 0,
  behind: 0,
  files: new Map([["a.ts", { path: "a.ts", status: "modified" }]]),
};

afterEach(() => {
  releaseGitSubscriptions();
  vi.clearAllMocks();
});

it("sends its provider's events with the subscription's id until unsubscribed", async () => {
  const id = await service.subscribe("/repo/src");
  expect(providers.getProvider).toHaveBeenCalledWith("/repo/src");

  fire("status", { status, added: ["a.ts"], modified: [], removed: [] });
  fire("branch", { previousBranch: "main", currentBranch: "feature" });
  fire("head", { previousHead: "a", currentHead: "b", isBranchSwitch: true });

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
  fire("status", { status, added: [], modified: [], removed: [] });

  expect(send).toHaveBeenCalledTimes(3);
  expect(providers.releaseProvider).toHaveBeenCalledTimes(1);
  expect(providers.releaseProvider).toHaveBeenCalledWith("/repo");
});

it("releases every subscription when the page that made them goes away", async () => {
  await service.subscribe("/repo/a");
  await service.subscribe("/repo/b");

  releaseGitSubscriptions();
  fire("status", { status, added: [], modified: [], removed: [] });

  expect(send).not.toHaveBeenCalled();
  expect(providers.releaseProvider).toHaveBeenCalledTimes(2);
});

it("subscribes to nothing outside a repository", async () => {
  providers.getProvider.mockRejectedValueOnce(new Error("Not a git repo"));

  await expect(service.subscribe("/tmp")).resolves.toBeNull();
});

it("falls back to empty reads, and fails writes, without a provider", async () => {
  await expect(service.getStatus("/tmp")).resolves.toBeNull();
  await expect(service.getStatusFromBranch("/tmp", "main")).resolves.toEqual(
    new Map(),
  );
  await expect(service.getPerFileDiffStats("/tmp")).resolves.toEqual({
    staged: new Map(),
    unstaged: new Map(),
  });
  await expect(service.stage("/tmp", ["a.ts"])).rejects.toThrow(
    "No active git provider for: /tmp",
  );
});
