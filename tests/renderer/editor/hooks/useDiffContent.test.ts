import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/query";
import { renderHook } from "../../queryRender";
import { mockGitReads } from "../../git";

const { workingCopies, watcher } = vi.hoisted(() => ({
  workingCopies: new Map<string, string>(),
  watcher: { ready: Promise.resolve() },
}));

vi.mock("@features/git/components/useGitSubscription", () => ({
  useGitSubscription: (cwd: string) => ({
    cwd,
    whenReady: () => watcher.ready,
    watchedSince: null,
  }),
}));

vi.mock("../../../../src/renderer/components/panes/editor/registry", () => ({
  createModelKey: (filePath: string) => `file://${filePath}`,
  MonacoModelRegistry: {
    getInstance: () => ({
      getModelState: () => undefined,
      getModel: () => undefined,
      getOrCreateModel: async (filePath: string) => {
        const content = workingCopies.get(filePath);
        if (content === undefined) throw new Error("ENOENT");
        return { getValue: () => content };
      },
    }),
  },
}));

import { useDiffContent } from "../../../../src/renderer/components/panes/editor/hooks/useDiffContent";

const CWD = "/repo";
let reads: ReturnType<typeof mockGitReads>;

/** Content of each file at each ref, or the error git gives for it. */
function gitHas(files: Record<string, string | Error>) {
  reads.getFileAtRef.mockImplementation(async (_cwd, filePath, ref) => {
    const content = files[`${ref}:${filePath}`];
    if (content === undefined) {
      throw new Error(`fatal: path '${filePath}' does not exist in '${ref}'`);
    }
    if (content instanceof Error) throw content;
    return content;
  });
}

async function loaded(
  filePath: string | null,
  options?: Parameters<typeof useDiffContent>[2],
) {
  const hook = renderHook(() => useDiffContent(filePath, CWD, options));
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook.result.current;
}

beforeEach(() => {
  workingCopies.clear();
  watcher.ready = Promise.resolve();
  reads = mockGitReads();
});

describe("useDiffContent", () => {
  it("diffs HEAD against the working copy by default", async () => {
    gitHas({ "HEAD:/repo/a.ts": "a = 1" });
    workingCopies.set("/repo/a.ts", "a = 2");

    expect(await loaded("/repo/a.ts")).toEqual({
      original: "a = 1",
      modified: "a = 2",
      isLoading: false,
      error: null,
      errorMessage: null,
      isModifiedEditable: true,
    });
    expect(reads.getFileAtRef).toHaveBeenCalledWith(CWD, "/repo/a.ts", "HEAD");
  });

  it("reads both sides from git when neither is the working copy", async () => {
    gitHas({ "HEAD:/repo/a.ts": "a = 1", ":/repo/a.ts": "a = 2" });

    expect(
      await loaded("/repo/a.ts", {
        originalSource: "head",
        modifiedSource: "index",
      }),
    ).toMatchObject({
      original: "a = 1",
      modified: "a = 2",
      error: null,
      isModifiedEditable: false,
    });
  });

  it("reads a renamed file's original under its old path", async () => {
    gitHas({ "HEAD:/repo/old.ts": "x" });
    workingCopies.set("/repo/new.ts", "x");

    expect(
      await loaded("/repo/new.ts", { originalFilePath: "/repo/old.ts" }),
    ).toMatchObject({ original: "x", modified: "x", error: null });
  });

  it("shows a file git doesn't have yet as added", async () => {
    gitHas({
      "HEAD:/repo/new.ts": new Error(
        "fatal: path 'new.ts' exists on disk, but not in 'HEAD'",
      ),
    });
    workingCopies.set("/repo/new.ts", "fresh");

    expect(await loaded("/repo/new.ts")).toMatchObject({
      original: "",
      modified: "fresh",
      error: null,
    });
  });

  it("reports an untracked file that's gone from disk too", async () => {
    gitHas({});

    expect(await loaded("/repo/gone.ts")).toMatchObject({
      original: null,
      modified: null,
      error: { type: "not_tracked" },
    });
  });

  it("reports a ref that doesn't exist, and shows neither side", async () => {
    gitHas({ "nope:/repo/a.ts": new Error("fatal: bad revision 'nope'") });
    workingCopies.set("/repo/a.ts", "a = 2");

    expect(
      await loaded("/repo/a.ts", { originalSource: "nope" }),
    ).toMatchObject({
      original: null,
      modified: null,
      error: { type: "ref_not_found", message: 'Git ref "nope" not found' },
      errorMessage: 'Git ref "nope" not found',
    });
  });

  it("reports a binary file instead of diffing it", async () => {
    gitHas({ "HEAD:/repo/a.png": "\u0000\u0001PNG" });
    workingCopies.set("/repo/a.png", "\u0000\u0002PNG");

    expect(await loaded("/repo/a.png")).toMatchObject({
      original: null,
      error: { type: "binary_file" },
    });
  });

  it("reports a working copy that can't be read", async () => {
    gitHas({ "HEAD:/repo/a.ts": "a = 1" });

    expect(await loaded("/repo/a.ts")).toMatchObject({
      original: "a = 1",
      modified: null,
      error: { type: "file_not_found" },
    });
  });

  it("loads nothing without a file", async () => {
    expect(await loaded(null)).toMatchObject({
      original: null,
      modified: null,
      error: null,
    });
    expect(reads.getFileAtRef).not.toHaveBeenCalled();
  });

  it("shows the file selected last when an earlier read finishes after it", async () => {
    const pending = new Map<string, (content: string) => void>();
    reads.getFileAtRef.mockImplementation(
      (_cwd, filePath) =>
        new Promise((resolve) => pending.set(filePath, resolve)),
    );
    workingCopies.set("/repo/a.ts", "a");
    workingCopies.set("/repo/b.ts", "b");
    const hook = renderHook(({ filePath }) => useDiffContent(filePath, CWD), {
      initialProps: { filePath: "/repo/a.ts" },
    });
    await waitFor(() => expect(pending.has("/repo/a.ts")).toBe(true));

    hook.rerender({ filePath: "/repo/b.ts" });
    await waitFor(() => expect(pending.has("/repo/b.ts")).toBe(true));
    await act(async () => pending.get("/repo/b.ts")!("b at HEAD"));
    await act(async () => pending.get("/repo/a.ts")!("a at HEAD"));

    await waitFor(() =>
      expect(hook.result.current).toMatchObject({
        original: "b at HEAD",
        modified: "b",
        isLoading: false,
      }),
    );
  });

  it("reads once the cwd is watched, since main has nothing to read before", async () => {
    let watched = false;
    let watch!: () => void;
    watcher.ready = new Promise((resolve) => {
      watch = () => {
        watched = true;
        resolve();
      };
    });
    reads.getFileAtRef.mockImplementation(async () =>
      watched ? "a = 1" : null,
    );
    workingCopies.set("/repo/a.ts", "a = 2");
    const hook = renderHook(() => useDiffContent("/repo/a.ts", CWD));

    await act(async () => watch());

    await waitFor(() =>
      expect(hook.result.current).toMatchObject({
        original: "a = 1",
        modified: "a = 2",
        isLoading: false,
      }),
    );
  });

  it("shares one read between diffs of the same file", async () => {
    gitHas({ "HEAD:/repo/a.ts": "a = 1" });
    workingCopies.set("/repo/a.ts", "a = 2");
    const queryClient = createQueryClient();

    const first = renderHook(() => useDiffContent("/repo/a.ts", CWD), {
      queryClient,
    });
    const second = renderHook(() => useDiffContent("/repo/a.ts", CWD), {
      queryClient,
    });

    await waitFor(() => {
      expect(first.result.current.original).toBe("a = 1");
      expect(second.result.current.original).toBe("a = 1");
    });
    expect(reads.getFileAtRef).toHaveBeenCalledTimes(1);
  });

  it("doesn't log a new file's missing original as a failure", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    gitHas({});
    workingCopies.set("/repo/new.ts", "fresh");

    try {
      expect(await loaded("/repo/new.ts")).toMatchObject({ original: "" });
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
