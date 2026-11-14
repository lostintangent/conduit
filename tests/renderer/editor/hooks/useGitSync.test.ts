import { act, waitFor } from "@testing-library/react";
import { useMutation } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/actions/notifications", () => ({
  enqueueNotification: vi.fn(),
}));

import { gitMutations } from "@features/git/client/queries";
import type { GitSubscription } from "@features/git/client/GitSubscription";
import { useGitSync } from "@/components/panes/editor/hooks/useGitSync";
import { getFriendlyGitError } from "@/components/panes/editor/utils/gitErrorMessages";
import { enqueueNotification } from "@/store/actions/notifications";
import { mockGitReads, mockGitWrites } from "../../git";
import { renderHook } from "../../queryRender";

const status = (upstream?: string) => ({
  branch: "main",
  upstream,
  ahead: 0,
  behind: 0,
  files: new Map(),
});

function createGit() {
  return {
    cwd: "/project",
    watchedSince: 0,
    whenReady: vi.fn().mockResolvedValue(undefined),
  };
}

// A git call that stays pending until the test settles it
function hang() {
  let settle!: (error?: Error) => void;
  const promise = new Promise<void>((resolve, reject) => {
    settle = (error) => (error ? reject(error) : resolve());
  });
  return { promise, settle: (error?: Error) => act(async () => settle(error)) };
}

// useGitSync, beside a commit and a stage made elsewhere in the same cwd
function renderSync(git: ReturnType<typeof createGit>) {
  const api = git as unknown as GitSubscription;
  return renderHook(() => ({
    sync: useGitSync(api),
    commit: useMutation(gitMutations.commit(git.cwd)).mutate,
    stage: useMutation(gitMutations.stage(git.cwd)).mutate,
  }));
}

let reads: ReturnType<typeof mockGitReads>;
let writes: ReturnType<typeof mockGitWrites>;

beforeEach(() => {
  reads = mockGitReads();
  reads.getStatus.mockResolvedValue(status("origin/main"));
  writes = mockGitWrites();
});

afterEach(() => {
  vi.mocked(enqueueNotification).mockClear();
  vi.restoreAllMocks();
});

describe("useGitSync", () => {
  it.each([
    ["pull", "isPulling"],
    ["push", "isPushing"],
  ] as const)(
    "notifies a failed %s with git's friendly message, and can retry it",
    async (method, pendingFlag) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const git = createGit();
      const call = hang();
      writes[method].mockReturnValueOnce(call.promise);
      const { result } = renderSync(git);
      await waitFor(() =>
        expect(reads.getStatus).toHaveBeenCalledWith("/project"),
      );

      act(() => result.current.sync[method]());
      await waitFor(() => expect(result.current.sync[pendingFlag]).toBe(true));

      const error = new Error("fatal: Could not read from remote repository.");
      await call.settle(error);
      await waitFor(() => expect(result.current.sync[pendingFlag]).toBe(false));
      const { message, details } = getFriendlyGitError(error);
      expect(enqueueNotification).toHaveBeenCalledWith({
        kind: "error",
        message,
        details,
      });

      act(() => result.current.sync[method]());
      await waitFor(() => expect(writes[method]).toHaveBeenCalledTimes(2));
    },
  );

  it("shows a commit made elsewhere in the cwd, and ignores pull and push until it's done", async () => {
    const git = createGit();
    const call = hang();
    writes.commit.mockReturnValueOnce(call.promise);
    const { result } = renderSync(git);

    act(() => result.current.commit("Fix bug"));
    await waitFor(() => expect(result.current.sync.isCommitting).toBe(true));

    act(() => {
      result.current.sync.pull();
      result.current.sync.push();
    });
    await call.settle();
    await waitFor(() => expect(result.current.sync.isCommitting).toBe(false));
    expect(writes.pull).not.toHaveBeenCalled();
    expect(writes.push).not.toHaveBeenCalled();
  });

  it("stages while a push is still running", async () => {
    const call = hang();
    writes.push.mockReturnValueOnce(call.promise);
    const { result } = renderSync(createGit());

    act(() => result.current.sync.push());
    await waitFor(() => expect(result.current.sync.isPushing).toBe(true));

    act(() => result.current.stage(["a.ts"]));
    await waitFor(() =>
      expect(writes.stage).toHaveBeenCalledWith("/project", ["a.ts"]),
    );
    expect(result.current.sync.isPushing).toBe(true);
    await call.settle();
  });

  it("publishes a branch with no upstream, then re-reads its status", async () => {
    reads.getStatus.mockResolvedValueOnce(status());
    const { result } = renderSync(createGit());
    await waitFor(() => expect(result.current.sync.hasUpstream).toBe(false));

    act(() => result.current.sync.push());

    await waitFor(() => expect(result.current.sync.hasUpstream).toBe(true));
    expect(writes.push).toHaveBeenCalledWith("/project", false, true);
  });
});
