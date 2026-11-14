import { describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => new Map<string, unknown>());
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: unknown) =>
      handlers.set(channel, handler),
  },
  BrowserWindow: { getAllWindows: (): unknown[] => [] },
  app: { isPackaged: false },
}));

// The workspaces disposer finishes only when the test releases it.
const workspaces = vi.hoisted(() => {
  let release = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  return { release: () => release(), released, stopped: false };
});
vi.mock("../../src/features/workspaces/main/startup", () => ({
  default: () => async () => {
    await workspaces.released;
    workspaces.stopped = true;
  },
}));

import { featuresArgument, startFeatures } from "../../src/ipc/features";

const manifest: Record<string, string[]> = JSON.parse(
  featuresArgument.slice("--features=".length),
);

describe("feature discovery", () => {
  it("lists every feature's service methods, keyed by folder name", () => {
    expect(Object.keys(manifest).sort()).toEqual([
      "dotfiles",
      "terminal",
      "updates",
      "workspaces",
    ]);
    expect(manifest.dotfiles).toContain("addFile");
    expect(manifest.terminal).toContain("create");
    expect(manifest.updates).toContain("install");
    expect(manifest.workspaces).toContain("getState");
  });

  it("serves each listed method and awaits startup disposers on stop", async () => {
    const stop = await startFeatures();

    expect([...handlers.keys()].sort()).toEqual(
      Object.entries(manifest)
        .flatMap(([name, methods]) => methods.map((m) => `${name}:${m}`))
        .sort(),
    );

    let settled = false;
    const stopping = stop().then(() => (settled = true));
    // Every microtask has run by the next macrotask, so a stop that didn't
    // wait on the disposer would have settled.
    await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);

    workspaces.release();
    await stopping;
    expect(workspaces.stopped).toBe(true);
  });
});
