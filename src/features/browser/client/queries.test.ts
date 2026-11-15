import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/query";
import { notificationsAtom } from "@features/workbench/client/atoms";
import { MutationObserver, type QueryClient } from "@tanstack/react-query";
import type { BrowserLibrary } from "../model";
import {
  installLibraryQueryBridge,
  libraryMutations,
  libraryQuery,
} from "./queries";

let queryClient: QueryClient;
const cached = () => queryClient.getQueryData(libraryQuery.queryKey);

beforeEach(() => {
  queryClient = createQueryClient();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  notificationsAtom.set([]);
  vi.restoreAllMocks();
  delete (window as any).conduit;
});

describe("the browser's library", () => {
  it("shows the pages main records as the user visits them", () => {
    let changed!: (library: BrowserLibrary) => void;
    (window as any).conduit = {
      browser: {
        on: (_event: "libraryChanged", listener: typeof changed) => {
          changed = listener;
          return () => {};
        },
      },
    };
    installLibraryQueryBridge(queryClient);

    const library = {
      favorites: [],
      history: [{ url: "https://a.com/", title: "A", visitedAt: 1 }],
    };
    changed(library);

    expect(cached()).toEqual(library);
  });

  it("shows a change that main couldn't save", async () => {
    const library = { favorites: [], history: [] };
    queryClient.setQueryData(libraryQuery.queryKey, library);
    (window as any).conduit = {
      browser: {
        addFavorite: () =>
          Promise.reject(new Error("EACCES: permission denied")),
      },
    };

    await new MutationObserver(queryClient, libraryMutations.addFavorite())
      .mutate({ url: "https://a.com/", title: "A" })
      .catch(() => {});

    expect(notificationsAtom.get()).toMatchObject([
      {
        kind: "error",
        message: "Couldn't save browser history and favorites",
        details: "EACCES: permission denied",
      },
    ]);
    expect(cached()).toBe(library);
  });
});
