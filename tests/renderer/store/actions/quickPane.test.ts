import { describe, expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => {
  const create = vi.fn();
  (window as any).conduit = { terminal: { create } };
  return { create };
});

import { openQuickTerminal } from "@/store/actions/quickPane";
import { quickPaneAtom } from "@/store/atoms";

describe("openQuickTerminal", () => {
  it("shows a quick terminal whose shell starts once it has fit", async () => {
    create.mockResolvedValue({
      sessionId: "session-1",
      cwd: "/work",
      title: "zsh",
    });

    await openQuickTerminal("/work");

    expect(create).toHaveBeenCalledWith({ cwd: "/work", waitForSize: true });
    expect(quickPaneAtom.get()).toEqual({
      type: "terminal",
      sessionId: "session-1",
      cwd: "/work",
    });
  });
});
