import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gitKeys } from "@features/git/client/queries";
import { createQueryClient } from "@/query";
import { renderHook } from "../../queryRender";
import { mockGitReads } from "../../git";

vi.mock("@features/git/components/useGitSubscription", () => ({
  useGitSubscription: (cwd: string) => ({
    cwd,
    whenReady: () => Promise.resolve(),
    watchedSince: null,
  }),
}));

import { useGitContent } from "../../../../src/renderer/components/panes/editor/hooks/useGitContent";

const CWD = "/repo";
let reads: ReturnType<typeof mockGitReads>;

beforeEach(() => {
  reads = mockGitReads();
});

describe("useGitContent", () => {
  it("shares one read between editors showing the same side", async () => {
    reads.getFileAtRef.mockResolvedValue("a = 1");
    const queryClient = createQueryClient();

    const first = renderHook(() => useGitContent("/repo/a.ts", "index", CWD), {
      queryClient,
    });
    const second = renderHook(() => useGitContent("/repo/a.ts", "index", CWD), {
      queryClient,
    });

    await waitFor(() => {
      expect(first.result.current.content).toBe("a = 1");
      expect(second.result.current.content).toBe("a = 1");
    });
    expect(reads.getFileAtRef).toHaveBeenCalledTimes(1);
  });

  // The git bridge re-reads open sides when a stage or commit moves them
  it("shows a re-read of its side without loading again", async () => {
    reads.getFileAtRef.mockResolvedValue("a = 1");
    const queryClient = createQueryClient();
    const loading: boolean[] = [];
    const hook = renderHook(
      () => {
        const result = useGitContent("/repo/a.ts", "index", CWD);
        loading.push(result.isLoading);
        return result;
      },
      { queryClient },
    );
    await waitFor(() => expect(hook.result.current.content).toBe("a = 1"));
    loading.length = 0;

    reads.getFileAtRef.mockResolvedValue("a = 2");
    await act(() =>
      queryClient.invalidateQueries({
        queryKey: [...gitKeys.all(CWD), "fileAtRef"],
      }),
    );

    await waitFor(() =>
      expect(hook.result.current).toEqual({
        content: "a = 2",
        isLoading: false,
        error: null,
      }),
    );
    expect(loading).not.toContain(true);
    expect(reads.getFileAtRef).toHaveBeenLastCalledWith(CWD, "/repo/a.ts", "");
  });
});
