/**
 * Tests for the useCommitGraph hook: history pages, tracked branches and
 * commit files read through the query cache.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { renderHook } from "../../../../queryRender";

vi.mock(
  "@/components/panes/editor/components/CommitGraph/graph/swimlanes",
  () => ({
    computeSwimlanes: vi.fn(
      (commits: HistoryCommit[], options?: { headCommitId?: string }) =>
        commits.map((commit): CommitGraphNode => ({
          commit,
          laneIndex: 0,
          inputSwimlanes: [],
          outputSwimlanes: [],
          isMerge: false,
          isHead: options?.headCommitId === commit.id,
          segmentType: null,
        })),
    ),
  }),
);

import { useCommitGraph } from "@/components/panes/editor/hooks/useCommitGraph";
import { computeSwimlanes } from "@/components/panes/editor/components/CommitGraph/graph/swimlanes";
import type { GitV2API } from "@/api/GitV2API";
import type {
  CommitGraphNode,
  HistoryCommit,
} from "@/components/panes/editor/components/CommitGraph/types";

function commit(id: string): HistoryCommit {
  return {
    id,
    shortId: id.slice(0, 7),
    subject: `Commit ${id}`,
    message: `Commit ${id}`,
    author: "Test Author",
    authorEmail: "test@example.com",
    timestamp: 1_700_000_000_000,
    parentIds: [],
  };
}

const file = (path: string) => ({
  path,
  status: "modified",
  additions: 1,
  deletions: 0,
  isBinary: false,
});

const page = (ids: string[], hasMore = false) => ({
  commits: ids.map(commit),
  hasMore,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let mockGit: {
  cwd: string;
  whenReady: ReturnType<typeof vi.fn>;
  getCommitHistory: ReturnType<typeof vi.fn>;
  getTrackedBranches: ReturnType<typeof vi.fn>;
  getCommitFiles: ReturnType<typeof vi.fn>;
};

function renderGraph(headCommitId?: string) {
  return renderHook(() =>
    useCommitGraph(mockGit as unknown as GitV2API, { headCommitId }),
  );
}

async function renderLoaded() {
  const rendered = renderGraph();
  await waitFor(() => expect(rendered.result.current.isLoading).toBe(false));
  return rendered;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGit = {
    cwd: "/repo",
    whenReady: vi.fn().mockResolvedValue(undefined),
    getCommitHistory: vi.fn().mockResolvedValue(page(["abc123"])),
    getTrackedBranches: vi.fn().mockResolvedValue({
      current: { name: "main", commitId: "abc123" },
      upstream: null,
      base: null,
    }),
    getCommitFiles: vi.fn().mockResolvedValue([file("a.ts")]),
  };
});

describe("useCommitGraph", () => {
  it("loads the first page and tracked branches, with the newest commit as HEAD", async () => {
    mockGit.getCommitHistory.mockResolvedValue(page(["abc123", "def456"]));
    const { result } = renderGraph();

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.nodes).toHaveLength(2));
    await waitFor(() =>
      expect(result.current.trackedBranches?.current?.name).toBe("main"),
    );

    expect(mockGit.getCommitHistory).toHaveBeenCalledWith({
      limit: 50,
      skip: 0,
    });
    expect(result.current.nodes.map((node) => node.isHead)).toEqual([
      true,
      false,
    ]);
    expect(vi.mocked(computeSwimlanes)).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({
        trackedBranches: expect.objectContaining({
          current: { name: "main", commitId: "abc123" },
        }),
      }),
    );
  });

  it("marks the given HEAD instead of the newest commit", async () => {
    mockGit.getCommitHistory.mockResolvedValue(page(["abc123", "def456"]));
    const { result } = renderGraph("def456");

    await waitFor(() => expect(result.current.nodes).toHaveLength(2));
    expect(result.current.nodes.map((node) => node.isHead)).toEqual([
      false,
      true,
    ]);
  });

  it("shows an empty graph when there are no commits", async () => {
    mockGit.getCommitHistory.mockResolvedValue(page([]));
    const { result } = await renderLoaded();

    expect(result.current.nodes).toEqual([]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.error).toBeNull();
  });

  describe("errors", () => {
    it.each([
      ["fatal: not a git repository", "Not a git repository"],
      ["fatal: bad revision 'x'", "Invalid branch or commit reference"],
      ["something broke", "something broke"],
    ])("reports %s as %s", async (message, expected) => {
      mockGit.getCommitHistory.mockRejectedValue(new Error(message));
      const { result } = renderGraph();

      await waitFor(() => expect(result.current.error).toBe(expected));
    });

    it("hides the error while refreshing and clears it once a read succeeds", async () => {
      mockGit.getCommitHistory.mockRejectedValueOnce(new Error("busy"));
      const { result } = renderGraph();
      await waitFor(() => expect(result.current.error).toBe("busy"));

      const retry = deferred<ReturnType<typeof page>>();
      mockGit.getCommitHistory.mockReturnValueOnce(retry.promise);
      act(() => result.current.refresh());
      await waitFor(() => expect(result.current.isLoading).toBe(true));
      expect(result.current.error).toBeNull();

      await act(async () => retry.resolve(page(["abc123"])));
      await waitFor(() => expect(result.current.nodes).toHaveLength(1));
      expect(result.current.error).toBeNull();
    });
  });

  describe("pages", () => {
    it("loads the next page after the commits already loaded", async () => {
      const next = deferred<ReturnType<typeof page>>();
      mockGit.getCommitHistory
        .mockResolvedValueOnce(page(["abc123", "bcd234"], true))
        .mockReturnValueOnce(next.promise);
      const { result } = await renderLoaded();
      expect(result.current.hasMore).toBe(true);

      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.isLoadingMore).toBe(true));
      expect(result.current.isLoading).toBe(false);

      await act(async () => next.resolve(page(["def456"])));
      await waitFor(() => expect(result.current.nodes).toHaveLength(3));
      expect(mockGit.getCommitHistory).toHaveBeenLastCalledWith({
        limit: 50,
        skip: 2,
      });
      expect(result.current.hasMore).toBe(false);
      expect(result.current.isLoadingMore).toBe(false);
    });

    it("doesn't load more when there's nothing more", async () => {
      const { result } = await renderLoaded();

      act(() => result.current.loadMore());

      expect(result.current.isLoadingMore).toBe(false);
      expect(mockGit.getCommitHistory).toHaveBeenCalledTimes(1);
    });

    it("re-reads every loaded page and the tracked branches on refresh", async () => {
      mockGit.getCommitHistory
        .mockResolvedValueOnce(page(["abc123"], true))
        .mockResolvedValueOnce(page(["def456"]));
      const { result } = await renderLoaded();
      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.nodes).toHaveLength(2));

      mockGit.getCommitHistory
        .mockResolvedValueOnce(page(["new789", "abc123"], true))
        .mockResolvedValueOnce(page(["def456"]));
      act(() => result.current.refresh());

      await waitFor(() =>
        expect(result.current.nodes.map((node) => node.commit.id)).toEqual([
          "new789",
          "abc123",
          "def456",
        ]),
      );
      expect(mockGit.getCommitHistory).toHaveBeenLastCalledWith({
        limit: 50,
        skip: 2,
      });
      expect(mockGit.getTrackedBranches).toHaveBeenCalledTimes(2);
    });
  });

  describe("expanding commits", () => {
    it("loads a commit's files the first time it's expanded", async () => {
      const files = deferred<ReturnType<typeof file>[]>();
      mockGit.getCommitFiles.mockReturnValueOnce(files.promise);
      const { result } = await renderLoaded();

      act(() => result.current.toggleExpand("abc123"));
      expect(result.current.expandedCommitIds.has("abc123")).toBe(true);
      await waitFor(() =>
        expect(result.current.nodes[0].isLoadingFiles).toBe(true),
      );

      await act(async () => files.resolve([file("a.ts"), file("b.ts")]));
      await waitFor(() =>
        expect(result.current.nodes[0].files?.map((f) => f.path)).toEqual([
          "a.ts",
          "b.ts",
        ]),
      );
      expect(result.current.nodes[0].isLoadingFiles).toBe(false);
      expect(mockGit.getCommitFiles).toHaveBeenCalledWith("abc123");
    });

    it("collapses, and re-expands without reading the files again", async () => {
      const { result } = await renderLoaded();
      act(() => result.current.toggleExpand("abc123"));
      await waitFor(() =>
        expect(result.current.nodes[0].files).toHaveLength(1),
      );

      act(() => result.current.toggleExpand("abc123"));
      expect(result.current.expandedCommitIds.size).toBe(0);
      expect(result.current.nodes[0].files).toBeUndefined();

      act(() => result.current.toggleExpand("abc123"));
      expect(result.current.nodes[0].files).toHaveLength(1);
      expect(mockGit.getCommitFiles).toHaveBeenCalledTimes(1);
    });

    it("stops loading without files when they can't be read", async () => {
      mockGit.getCommitFiles.mockRejectedValue(new Error("gone"));
      const { result } = await renderLoaded();

      act(() => result.current.toggleExpand("abc123"));

      await waitFor(() =>
        expect(mockGit.getCommitFiles).toHaveBeenCalledTimes(1),
      );
      await waitFor(() =>
        expect(result.current.nodes[0].isLoadingFiles).toBe(false),
      );
      expect(result.current.nodes[0].files).toBeUndefined();
      expect(result.current.error).toBeNull();
    });

    it("keeps expanded commits and their files when more commits load", async () => {
      mockGit.getCommitHistory
        .mockResolvedValueOnce(page(["abc123"], true))
        .mockResolvedValueOnce(page(["def456"]));
      const { result } = await renderLoaded();
      act(() => result.current.toggleExpand("abc123"));
      await waitFor(() =>
        expect(result.current.nodes[0].files).toHaveLength(1),
      );

      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.nodes).toHaveLength(2));

      expect(result.current.expandedCommitIds.has("abc123")).toBe(true);
      expect(result.current.nodes[0].files).toHaveLength(1);
      expect(mockGit.getCommitFiles).toHaveBeenCalledTimes(1);
    });
  });
});
