import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gitKeys } from "@features/git/client/queries";
import {
  FileDiffStatsProvider,
  useFileDiffStats,
} from "@/components/panes/editor/components/FileDiffStats/FileDiffStatsContext";
import { createQueryClient } from "@/query";
import { mockGitReads } from "../../../git";
import { render } from "../../../queryRender";

function createMockGit() {
  return {
    cwd: "/project",
    watchedSince: 0,
    whenReady: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockFs() {
  return { onAnyFileContentChanged: vi.fn().mockReturnValue(vi.fn()) };
}

function Stats({ path }: { path: string }) {
  const stats = useFileDiffStats(path);
  return (
    <span data-testid="stats">
      {stats ? `+${stats.added} -${stats.removed}` : "none"}
    </span>
  );
}

function renderProvider(
  git: ReturnType<typeof createMockGit>,
  fs: ReturnType<typeof createMockFs>,
  queryClient = createQueryClient(),
) {
  return render(
    <FileDiffStatsProvider git={git as any} fs={fs as any}>
      <Stats path="src/a.ts" />
    </FileDiffStatsProvider>,
    { queryClient },
  );
}

describe("FileDiffStatsProvider", () => {
  let reads: ReturnType<typeof mockGitReads>;

  beforeEach(() => {
    reads = mockGitReads();
    reads.findRoot.mockResolvedValue("/project");
    reads.getPerFileDiffStats.mockResolvedValue({
      staged: new Map(),
      unstaged: new Map([["src/a.ts", { added: 3, removed: 1 }]]),
    });
  });

  it("re-reads the stats once file edits settle", async () => {
    const git = createMockGit();
    const fs = createMockFs();
    renderProvider(git, fs);
    await waitFor(() => {
      expect(screen.getByTestId("stats").textContent).toBe("+3 -1");
    });

    reads.getPerFileDiffStats.mockResolvedValue({
      staged: new Map(),
      unstaged: new Map([["src/a.ts", { added: 4, removed: 1 }]]),
    });
    const onContentChanged = fs.onAnyFileContentChanged.mock.calls[0][0];
    onContentChanged();
    onContentChanged();

    await waitFor(() => {
      expect(screen.getByTestId("stats").textContent).toBe("+4 -1");
    });
    expect(reads.getPerFileDiffStats).toHaveBeenCalledTimes(2);
    expect(reads.getPerFileDiffStats).toHaveBeenCalledWith("/project");
  });

  it("shares one read between editors on the same cwd", async () => {
    const queryClient = createQueryClient();
    const git = createMockGit();
    renderProvider(git, createMockFs(), queryClient);
    renderProvider(git, createMockFs(), queryClient);

    await waitFor(() => {
      expect(screen.getAllByTestId("stats").map((s) => s.textContent)).toEqual([
        "+3 -1",
        "+3 -1",
      ]);
    });
    expect(reads.findRoot).toHaveBeenCalledTimes(1);
    expect(reads.getPerFileDiffStats).toHaveBeenCalledTimes(1);
  });

  it("reads nothing and ignores edits outside a git repo", async () => {
    const queryClient = createQueryClient();
    const git = createMockGit();
    reads.findRoot.mockResolvedValue(null);
    const fs = createMockFs();
    renderProvider(git, fs, queryClient);

    await waitFor(() => {
      expect(queryClient.getQueryState(gitKeys.root("/project"))?.status).toBe(
        "success",
      );
    });
    expect(screen.getByTestId("stats").textContent).toBe("none");
    expect(reads.getPerFileDiffStats).not.toHaveBeenCalled();
    expect(fs.onAnyFileContentChanged).not.toHaveBeenCalled();
  });
});
