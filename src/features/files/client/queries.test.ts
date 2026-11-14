import { beforeEach, describe, expect, it, vi } from "vitest";

const { files, emit, enqueueNotification } = vi.hoisted(() => {
  const listeners = new Set<(payload: unknown) => void>();
  const files = {
    readDirectory: vi.fn(),
    writeFile: vi.fn(),
    createDirectory: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
    on: vi.fn((_event: string, listener: (payload: unknown) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).window.conduit = { files };

  return {
    files,
    enqueueNotification: vi.fn(),
    emit: (payload: unknown) => {
      for (const listener of listeners) listener(payload);
    },
  };
});

vi.mock("@features/workbench/client/actions/notifications", () => ({
  enqueueNotification,
}));

import {
  MutationObserver,
  type MutationObserverOptions,
  type QueryClient,
} from "@tanstack/react-query";
import { createQueryClient } from "@/query";
import type { DirectoryEntry } from "../model";
import { filesKeys, filesMutations, installFilesQueryBridge } from "./queries";

const file = (name: string): DirectoryEntry => ({
  name,
  type: "file",
  isSymlink: false,
});

const listing = (client: QueryClient, dir: string) =>
  client.getQueryData<DirectoryEntry[]>(filesKeys.listing(dir));

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  for (const write of [
    files.writeFile,
    files.createDirectory,
    files.rename,
    files.delete,
  ]) {
    write.mockResolvedValue(undefined);
  }
  client = createQueryClient();
  client.setQueryData(filesKeys.listing("/p"), [file("a.ts")]);
});

describe("installFilesQueryBridge", () => {
  it("writes each reported listing over the cached one, and caches no others", () => {
    const uninstall = installFilesQueryBridge(client);

    emit({ subscriptionId: "sub", path: "/p", entries: [file("b.ts")] });
    emit({ subscriptionId: "sub", path: "/p/src", entries: [file("c.ts")] });

    expect(listing(client, "/p")).toEqual([file("b.ts")]);
    expect(listing(client, "/p/src")).toBeUndefined();
    expect(files.on).toHaveBeenCalledWith(
      "directoryListingChanged",
      expect.any(Function),
    );
    uninstall();
  });
});

describe("filesMutations", () => {
  const run = <Data, Variables>(
    options: MutationObserverOptions<Data, Error, Variables>,
    variables: Variables,
  ) => new MutationObserver(client, options).mutate(variables);

  it("updates the folder's cached listing as soon as main replies", async () => {
    await run(filesMutations.create("/p"), {
      dir: "/p",
      name: "b.ts",
      type: "file",
    });
    await run(filesMutations.create("/p"), {
      dir: "/p",
      name: "lib",
      type: "folder",
    });
    await run(filesMutations.rename("/p"), { path: "/p/a.ts", name: "c.ts" });
    await run(filesMutations.delete("/p"), {
      path: "/p/b.ts",
      recursive: false,
    });

    expect(listing(client, "/p")).toEqual([
      file("c.ts"),
      { name: "lib", type: "directory", isSymlink: false },
    ]);
    expect(files.writeFile).toHaveBeenCalledWith(
      "/p",
      "/p/b.ts",
      new Uint8Array(0),
    );
    expect(files.createDirectory).toHaveBeenCalledWith("/p", "/p/lib");
    expect(files.rename).toHaveBeenCalledWith("/p", "/p/a.ts", "/p/c.ts");
    expect(files.delete).toHaveBeenCalledWith("/p", "/p/b.ts", {
      recursive: false,
    });
  });

  it("leaves folders nobody has listed uncached", async () => {
    await run(filesMutations.create("/p"), {
      dir: "/p/lib",
      name: "b.ts",
      type: "file",
    });

    expect(listing(client, "/p/lib")).toBeUndefined();
  });

  it("notifies what failed to change, and leaves the listing", async () => {
    files.rename.mockRejectedValue(new Error("EACCES"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      run(filesMutations.rename("/p"), { path: "/p/a.ts", name: "c.ts" }),
    ).rejects.toThrow("EACCES");

    expect(enqueueNotification).toHaveBeenCalledWith({
      kind: "error",
      message: 'Failed to rename "a.ts"',
      details: "EACCES",
    });
    expect(listing(client, "/p")).toEqual([file("a.ts")]);
    consoleError.mockRestore();
  });
});
