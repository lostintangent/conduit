import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("electron", () => ({
  ipcRenderer: { invoke, on: vi.fn(), removeListener: vi.fn() },
}));

import { createFeatureApis } from "../../src/preload/window/features";

describe("createFeatureApis", () => {
  let demo: Record<string, (...args: unknown[]) => Promise<unknown>>;

  beforeAll(() => {
    process.argv.push(`--features=${JSON.stringify({ demo: ["run"] })}`);
    const apis = createFeatureApis() as unknown as Record<string, typeof demo>;
    demo = apis.demo;
    process.argv.pop();
  });

  beforeEach(() => invoke.mockReset());

  it("invokes <feature>:<method> for each method main lists", async () => {
    invoke.mockResolvedValue("ran");

    await expect(demo.run(1, "two")).resolves.toBe("ran");
    expect(invoke).toHaveBeenCalledWith("demo:run", 1, "two");
  });

  it("rejects with the message the service threw", async () => {
    invoke.mockRejectedValueOnce(
      new Error("Error invoking remote method 'demo:run': Error: boom"),
    );
    await expect(demo.run()).rejects.toThrow(/^boom$/);

    invoke.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'demo:run': TypeError: Cannot read properties of null",
      ),
    );
    await expect(demo.run()).rejects.toThrow(
      /^Cannot read properties of null$/,
    );
  });
});
