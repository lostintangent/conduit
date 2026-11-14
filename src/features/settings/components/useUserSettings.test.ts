import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { notificationsAtom } from "@/store/atoms";
import { useUserSettings } from "./useUserSettings";

describe("useUserSettings", () => {
  afterEach(() => {
    notificationsAtom.set([]);
    delete (window as any).conduit;
  });

  it("shows a browser history save that failed", async () => {
    (window as any).conduit = {
      settings: {
        addUrlToHistory: () =>
          Promise.reject(new Error("EACCES: permission denied")),
      },
    };
    const { result } = renderHook(() => useUserSettings());

    await result.current.addUrlToHistory("https://example.com");

    expect(notificationsAtom.get()).toMatchObject([
      {
        kind: "error",
        message: "Couldn't update settings",
        details: "EACCES: permission denied",
      },
    ]);
  });
});
