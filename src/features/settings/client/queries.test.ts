import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/query";
import { notificationsAtom } from "@/store/atoms";
import { MutationObserver, type QueryClient } from "@tanstack/react-query";
import {
  seedSettings,
  testSettings,
} from "../../../../tests/renderer/queryRender";
import type { UserSettings } from "../model";
import {
  installSettingsQueryBridge,
  settingsMutations,
  settingsQuery,
} from "./queries";

let queryClient: QueryClient;
const cached = () => queryClient.getQueryData(settingsQuery.queryKey);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function update(updates: Partial<UserSettings>) {
  return new MutationObserver(queryClient, settingsMutations.update())
    .mutate(updates)
    .catch(() => {});
}

beforeEach(() => {
  queryClient = seedSettings(createQueryClient());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  notificationsAtom.set([]);
  vi.restoreAllMocks();
  delete (window as any).conduit;
});

describe("settings", () => {
  it("keeps a later change showing while main replies to an earlier one", async () => {
    const replies = [deferred<UserSettings>(), deferred<UserSettings>()];
    (window as any).conduit = {
      settings: { update: vi.fn(() => replies.shift()!.promise) },
    };
    const first = replies[0];
    const second = replies[1];

    const ruler = update({ showTerminalRuler: true });
    const dim = update({ dimInactivePanes: true });
    expect(cached()).toMatchObject({
      showTerminalRuler: true,
      dimInactivePanes: true,
    });

    first.resolve(testSettings({ showTerminalRuler: true }));
    await ruler;
    expect(cached()).toMatchObject({
      showTerminalRuler: true,
      dimInactivePanes: true,
    });

    second.resolve(
      testSettings({ showTerminalRuler: true, dimInactivePanes: true }),
    );
    await dim;
    expect(cached()).toMatchObject({
      showTerminalRuler: true,
      dimInactivePanes: true,
    });
  });

  it("shows main's settings again, and the error, when a change fails to save", async () => {
    (window as any).conduit = {
      settings: {
        update: () => Promise.reject(new Error("EACCES: permission denied")),
        get: async () => testSettings({ showTerminalRuler: false }),
      },
    };

    await update({ showTerminalRuler: true });

    await vi.waitFor(() => expect(cached()?.showTerminalRuler).toBe(false));
    expect(notificationsAtom.get()).toMatchObject([
      {
        kind: "error",
        message: "Couldn't update settings",
        details: "EACCES: permission denied",
      },
    ]);
  });

  it("shows a browser history save that failed", async () => {
    (window as any).conduit = {
      settings: {
        addUrlToHistory: () =>
          Promise.reject(new Error("EACCES: permission denied")),
      },
    };

    await new MutationObserver(queryClient, settingsMutations.addUrlToHistory())
      .mutate("https://example.com")
      .catch(() => {});

    expect(notificationsAtom.get()).toMatchObject([
      {
        kind: "error",
        message: "Couldn't update settings",
        details: "EACCES: permission denied",
      },
    ]);
  });

  it("shows changes made to settings.json while the app runs", () => {
    let changed!: (settings: UserSettings) => void;
    (window as any).conduit = {
      settings: {
        on: (_event: "changed", listener: typeof changed) => {
          changed = listener;
          return () => {};
        },
      },
    };
    installSettingsQueryBridge(queryClient);

    changed(testSettings({ theme: "light" }));

    expect(cached()?.theme).toBe("light");
  });
});
