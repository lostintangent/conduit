import { describe, expect, it } from "vitest";
import { until } from "./app";

describe("until", () => {
  it("times out a check that never finishes", async () => {
    await expect(
      until(() => new Promise<boolean>(() => {}), "a page that's stuck", 200),
    ).rejects.toThrow(
      "Timed out after 200ms waiting for a page that's stuck (last: a check still running at the deadline)",
    );
  });
});
