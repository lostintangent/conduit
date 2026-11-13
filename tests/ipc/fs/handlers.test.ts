import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => Promise<unknown>) =>
      handlers.set(channel, fn),
  },
}));

vi.mock("@parcel/watcher", () => ({
  default: {
    subscribe: vi.fn(async () => ({ unsubscribe: async () => {} })),
  },
}));

import watcher from "@parcel/watcher";
import { FileSystemProviderService } from "../../../src/ipc/fs/FileSystemProviderService";
import { initializeFileSystemV2Handlers } from "../../../src/ipc/fs/handlers";

describe("fs-v2 read handlers", () => {
  let dir: string;
  let file: string;

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "fs-handlers-"));
    file = path.join(dir, "package.json");
    writeFileSync(file, '{"scripts":{}}');
    initializeFileSystemV2Handlers();
  });

  afterAll(() => {
    FileSystemProviderService.resetInstance();
    rmSync(dir, { recursive: true, force: true });
  });

  // The package.json search reads from every parent of a terminal's cwd, up to /
  it("read from disk without watching the cwd they're given", async () => {
    const read = (channel: string, params: object) =>
      handlers.get(channel)?.({}, { cwd: "/", ...params });

    expect(
      new TextDecoder().decode(
        (await read("fs-v2:read-file", { filePath: file })) as Uint8Array,
      ),
    ).toBe('{"scripts":{}}');
    expect(await read("fs-v2:read-text-file", { filePath: file })).toBe(
      '{"scripts":{}}',
    );
    expect(await read("fs-v2:stat", { path: dir })).toMatchObject({
      type: "directory",
    });
    expect(await read("fs-v2:exists", { path: file })).toBe(true);
    await expect(
      read("fs-v2:read-file", { filePath: path.join(dir, "missing") }),
    ).rejects.toMatchObject({ code: "ENOENT" });

    expect(watcher.subscribe).not.toHaveBeenCalled();
    expect(
      FileSystemProviderService.getInstance().getExistingProvider("/"),
    ).toBeNull();
  });
});
