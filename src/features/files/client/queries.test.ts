import { beforeEach, describe, expect, it, vi } from "vitest";

const { files, emit } = vi.hoisted(() => {
  const listeners = new Set<(payload: unknown) => void>();
  const files = {
    on: vi.fn((_event: string, listener: (payload: unknown) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).window.conduit = { files };

  return {
    files,
    emit: (payload: unknown) => {
      for (const listener of listeners) listener(payload);
    },
  };
});

import type { QueryClient } from "@tanstack/react-query";
import { createQueryClient } from "@/query";
import type { DirectoryEntry } from "../model";
import { filesKeys, installFilesQueryBridge } from "./queries";

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
