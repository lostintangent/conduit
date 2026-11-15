import { describe, expect, it, vi } from "vitest";

const emit = vi.fn();
vi.mock("electron", () => ({ clipboard: {}, dialog: {}, shell: {} }));
vi.mock("../../../main/events", () => ({
  emitter: () => emit,
  getAppWindow: () => undefined,
}));

const { default: service, pageSavedBeforeClose } = await import("./service");

describe("closing the window", () => {
  it("waits for the page to save, but not for a page that doesn't answer", async () => {
    const saved = pageSavedBeforeClose(60_000);
    expect(emit).toHaveBeenCalledWith("beforeClose", undefined);
    service.readyToClose();
    await saved;

    await pageSavedBeforeClose(10);
  });
});
