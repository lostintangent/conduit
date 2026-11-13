import type { WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({}));

import { capturePage } from "../../../src/ipc/browser";

const fakeContents = (capture: ReturnType<typeof vi.fn>) =>
  ({ capturePage: capture }) as unknown as WebContents;

describe("capturePage", () => {
  it("retries while the page has no frame to copy yet", async () => {
    const image = {};
    const capture = vi
      .fn()
      .mockRejectedValueOnce(new Error("UnknownVizError"))
      .mockResolvedValueOnce(image);
    const rect = { x: 0, y: 0, width: 10, height: 10 };

    await expect(capturePage(fakeContents(capture), rect)).resolves.toBe(image);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenLastCalledWith(rect);
  });

  it("gives up after ten attempts", async () => {
    const capture = vi.fn().mockRejectedValue(new Error("Frame Gone"));

    await expect(capturePage(fakeContents(capture))).rejects.toThrow(
      "Frame Gone",
    );
    expect(capture).toHaveBeenCalledTimes(10);
  });
});
