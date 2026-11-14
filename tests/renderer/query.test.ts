import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/actions/notifications", () => ({
  enqueueNotification: vi.fn(),
}));

import { createQueryClient, runMutation } from "@/query";
import { enqueueNotification } from "@/store/actions/notifications";
import { MutationObserver, onlineManager } from "@tanstack/react-query";

const fail = (message: string) => async () => {
  throw new Error(message);
};

afterEach(() => {
  vi.mocked(enqueueNotification).mockClear();
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

describe("mutations", () => {
  it("notifies when one that asks to fails, and logs every failure", async () => {
    const queryClient = createQueryClient();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = (options: ConstructorParameters<typeof MutationObserver>[1]) =>
      new MutationObserver(queryClient, options)
        .mutate(undefined)
        .catch(() => {});

    await run({ mutationKey: ["quiet"], mutationFn: fail("inline") });
    await run({
      mutationKey: ["save"],
      mutationFn: fail("disk full"),
      meta: { errorMessage: "Couldn't save" },
    });
    await run({
      mutationKey: ["pull"],
      mutationFn: fail("fatal: no upstream"),
      meta: {
        errorMessage: (error) => {
          const friendly = {
            message: "No upstream",
            details: error.message.replace("fatal: ", ""),
            rawMessage: error.message,
          };
          return friendly;
        },
      },
    });

    expect(vi.mocked(enqueueNotification).mock.calls).toEqual([
      [{ kind: "error", message: "Couldn't save", details: "disk full" }],
      [{ kind: "error", message: "No upstream", details: "no upstream" }],
    ]);
    expect(error.mock.calls.map(([, key]) => key)).toEqual([
      ["quiet"],
      ["save"],
      ["pull"],
    ]);
  });

  it("run while the Mac is offline, since IPC doesn't need a network", async () => {
    onlineManager.setOnline(false);
    const observer = new MutationObserver(createQueryClient(), {
      mutationFn: async () => "written",
    });

    void observer.mutate();

    await vi.waitFor(() =>
      expect(observer.getCurrentResult()).toMatchObject({
        status: "success",
        data: "written",
      }),
    );
  });

  it("run outside React with runMutation, which rejects when one fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const write = vi.fn(async (value: number) => value * 2);

    await expect(runMutation({ mutationFn: write }, 21)).resolves.toBe(42);
    await expect(
      runMutation(
        {
          mutationFn: fail("locked"),
          meta: { errorMessage: "Couldn't write" },
        },
        undefined,
      ),
    ).rejects.toThrow("locked");
    expect(enqueueNotification).toHaveBeenCalledWith({
      kind: "error",
      message: "Couldn't write",
      details: "locked",
    });
  });
});
