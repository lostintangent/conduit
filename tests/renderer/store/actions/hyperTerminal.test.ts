import { describe, expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => {
  const create = vi.fn();
  (window as any).conduit = { terminal: { create } };
  return { create };
});

import { createHyperTerminal } from "@/store/actions/hyperTerminal";
import { hyperTerminalsAtom } from "@/store/atoms";

describe("createHyperTerminal", () => {
  it("opens a hyper terminal whose shell starts once it has fit", async () => {
    create.mockResolvedValue({
      sessionId: "session-1",
      cwd: "/work",
      title: "zsh",
    });

    await createHyperTerminal("/work", "npm run dev");

    expect(create).toHaveBeenCalledWith({
      cwd: "/work",
      command: "npm run dev",
      waitForSize: true,
    });
    expect(hyperTerminalsAtom.get()).toEqual([
      expect.objectContaining({
        terminalId: "session-1",
        cwd: "/work",
        state: "visible",
      }),
    ]);
  });
});
