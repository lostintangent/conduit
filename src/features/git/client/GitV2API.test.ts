import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

type Listener = (payload: unknown) => void;

const { mockGit, emit } = vi.hoisted(() => {
  const listeners = new Map<string, Set<Listener>>();
  const git = {
    getStatus: vi.fn(),
    getFileAtRef: vi.fn(),
    getStatusFromBranch: vi.fn(),
    getMostRecentCommittedFile: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    on: vi.fn((event: string, listener: Listener) => {
      const set = listeners.get(event) ?? new Set();
      listeners.set(event, set);
      set.add(listener);
      return () => set.delete(listener);
    }),
  };

  // Like an EventEmitter, a throwing listener stops the rest
  const emit = (event: string, payload: unknown) => {
    for (const listener of listeners.get(event) ?? []) {
      listener(payload);
    }
  };

  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).window.conduit = { git };

  return { mockGit: git, emit };
});

import { cwdForGitSubscription, GitV2API } from "./GitV2API";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function statusEvent(subscriptionId: string) {
  return {
    subscriptionId,
    status: { branch: "main", ahead: 0, behind: 0, files: new Map() },
    added: [],
    modified: [],
    removed: [],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("GitV2API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).window.conduit = { git: mockGit };
    mockGit.subscribe.mockResolvedValue("test-sub-id");
    mockGit.unsubscribe.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("reads", () => {
    it("subscribes for its cwd as it's created", async () => {
      const api = new GitV2API("/test/project");
      await api.whenReady();

      expect(mockGit.subscribe).toHaveBeenCalledWith("/test/project");
      expect(cwdForGitSubscription("test-sub-id")).toBe("/test/project");
      expect(api.watchedSince).not.toBeNull();

      api.release();
    });

    it("calls git with its cwd and returns what main sends", async () => {
      const status = {
        branch: "main",
        ahead: 1,
        behind: 0,
        files: new Map([
          ["a.ts", { path: "a.ts", status: "modified", staged: false }],
        ]),
      };
      mockGit.getStatus.mockResolvedValue(status);
      mockGit.getFileAtRef.mockResolvedValue("content");

      const api = new GitV2API("/test/project");

      await expect(api.getStatus()).resolves.toBe(status);
      await expect(api.getFileAtRef("a.ts", "HEAD")).resolves.toBe("content");
      await api.getStatusFromBranch("main");
      await api.getMostRecentCommittedFile(5);

      expect(mockGit.getStatus).toHaveBeenCalledWith("/test/project");
      expect(mockGit.getFileAtRef).toHaveBeenCalledWith(
        "/test/project",
        "a.ts",
        "HEAD",
      );
      expect(mockGit.getStatusFromBranch).toHaveBeenCalledWith(
        "/test/project",
        "main",
      );
      expect(mockGit.getMostRecentCommittedFile).toHaveBeenCalledWith(
        "/test/project",
        5,
      );

      api.release();
    });

    it("propagates IPC errors", async () => {
      mockGit.getStatus.mockRejectedValue(new Error("Git error"));

      const api = new GitV2API("/test/project");

      await expect(api.getStatus()).rejects.toThrow("Git error");

      api.release();
    });
  });

  describe("onStatusChanged", () => {
    it("calls back only with its own subscription's events", async () => {
      mockGit.subscribe
        .mockResolvedValueOnce("sub-a")
        .mockResolvedValueOnce("sub-b");
      const a = new GitV2API("/project/a");
      const b = new GitV2API("/project/b");
      await Promise.all([a.whenReady(), b.whenReady()]);

      const callback = vi.fn();
      a.onStatusChanged(callback);

      emit("statusChanged", statusEvent("sub-b"));
      expect(callback).not.toHaveBeenCalled();

      const event = statusEvent("sub-a");
      emit("statusChanged", event);
      expect(callback).toHaveBeenCalledWith(event);

      a.release();
      b.release();
    });

    it("stops calling back after cleanup or release", async () => {
      const api = new GitV2API("/test/project");
      await api.whenReady();

      const cleanedUp = vi.fn();
      const released = vi.fn();
      api.onStatusChanged(cleanedUp)();
      api.onStatusChanged(released);
      api.release();

      emit("statusChanged", statusEvent("test-sub-id"));

      expect(cleanedUp).not.toHaveBeenCalled();
      expect(released).not.toHaveBeenCalled();
    });

    it("isolates a throwing callback from the channel's other listeners", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const api = new GitV2API("/test/project");
      await api.whenReady();

      const goodCallback = vi.fn();
      api.onStatusChanged(() => {
        throw new Error("Listener error");
      });
      api.onStatusChanged(goodCallback);

      expect(() =>
        emit("statusChanged", statusEvent("test-sub-id")),
      ).not.toThrow();
      expect(goodCallback).toHaveBeenCalled();

      api.release();
    });

    it("subscribes without throwing outside a repository", async () => {
      mockGit.subscribe.mockResolvedValue(null);

      const api = new GitV2API("/not/a/repo");
      api.onStatusChanged(vi.fn());
      await api.whenReady();

      expect(mockGit.subscribe).toHaveBeenCalled();
      expect(api.watchedSince).toBeNull();

      api.release();
    });
  });

  describe("release", () => {
    it("unsubscribes once, however often it's called", async () => {
      const api = new GitV2API("/test/project");
      await api.whenReady();

      api.release();
      api.release();
      await settle();

      expect(mockGit.unsubscribe).toHaveBeenCalledTimes(1);
      expect(mockGit.unsubscribe).toHaveBeenCalledWith("test-sub-id");
      expect(cwdForGitSubscription("test-sub-id")).toBeUndefined();
      expect(api.watchedSince).toBeNull();
    });

    it("prevents further use", async () => {
      const api = new GitV2API("/test/project");
      api.release();

      await expect(api.getStatus()).rejects.toThrow(
        "GitV2API has been released",
      );
      expect(() => api.onStatusChanged(vi.fn())).toThrow(
        "GitV2API has been released",
      );
    });

    it("unsubscribes a subscription that arrives after release", async () => {
      let resolveSubscription: ((value: string) => void) | null = null;
      mockGit.subscribe.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSubscription = resolve;
          }),
      );

      const api = new GitV2API("/test/project");
      api.release();
      expect(mockGit.unsubscribe).not.toHaveBeenCalled();

      resolveSubscription!("late-subscription-id");
      await settle();

      expect(mockGit.unsubscribe).toHaveBeenCalledWith("late-subscription-id");
      expect(cwdForGitSubscription("late-subscription-id")).toBeUndefined();
    });
  });

  describe("whenReady", () => {
    it("resolves without subscribing again once subscribed", async () => {
      const api = new GitV2API("/test/project");
      await settle();

      await expect(api.whenReady()).resolves.toBeUndefined();
      expect(mockGit.subscribe).toHaveBeenCalledTimes(1);

      api.release();
    });

    it("waits for a pending subscription", async () => {
      let resolveSubscription: ((value: string) => void) | null = null;
      mockGit.subscribe.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSubscription = resolve;
          }),
      );

      const api = new GitV2API("/test/project");
      let ready = false;
      const readyPromise = api.whenReady().then(() => {
        ready = true;
      });

      await settle();
      expect(ready).toBe(false);

      resolveSubscription!("test-sub-id");
      await readyPromise;
      expect(ready).toBe(true);

      api.release();
    });

    it("resolves when subscribing fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mockGit.subscribe.mockRejectedValue(new Error("IPC down"));

      const api = new GitV2API("/test/project");

      await expect(api.whenReady()).resolves.toBeUndefined();
      expect(api.watchedSince).toBeNull();

      api.release();
    });
  });
});
