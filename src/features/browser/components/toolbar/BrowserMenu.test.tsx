import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { Activity } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/commands/hooks/useCommand", () => ({
  useCommand: () => ({ execute: vi.fn<() => Promise<void>>() }),
}));

import { createQueryClient } from "@/query";
import { libraryQuery } from "@features/browser/client/queries";
import { BrowserMenu } from "@features/browser/components/toolbar/BrowserMenu";
import type { BrowserLibrary } from "@features/browser/model";
import { TooltipProvider } from "@/ui/tooltip";
import { notificationsAtom } from "@features/workbench/client/atoms";
import { render } from "../../../../../tests/renderer/queryRender";

/** Main's browser service, with an empty library unless a test says otherwise */
let browser: Record<string, (...args: any[]) => Promise<BrowserLibrary>>;
beforeEach(() => {
  browser = { getLibrary: async () => ({ favorites: [], history: [] }) };
  (window as any).conduit = { browser };
});
afterEach(() => delete (window as any).conduit);

function browserMenu(
  onCaptureScreenshot: () => Promise<void> = () => Promise.resolve(),
) {
  return (
    <TooltipProvider>
      <BrowserMenu
        currentPage={{ url: "https://example.com", title: "Example" }}
        isDevToolsOpen={false}
        onToggleDevTools={() => {}}
        onHideToolbar={() => {}}
        onCaptureScreenshot={onCaptureScreenshot}
        tabId="tab-1"
      />
    </TooltipProvider>
  );
}

function chooseFromMenu(item: string) {
  fireEvent.keyDown(screen.getByLabelText("More options"), { key: "Enter" });
  fireEvent.click(screen.getByText(item));
}

function captureFromMenu(onCaptureScreenshot: () => Promise<void>) {
  render(browserMenu(onCaptureScreenshot));
  chooseFromMenu("Copy screenshot");
}

const checkmarkShown = () =>
  !!screen.getByLabelText("More options").querySelector(".text-green-500");

describe("BrowserMenu screenshot", () => {
  afterEach(() => notificationsAtom.set([]));

  it("shows the checkmark once the screenshot is copied", async () => {
    captureFromMenu(() => Promise.resolve());

    await waitFor(() => expect(checkmarkShown()).toBe(true));
    expect(notificationsAtom.get()).toEqual([]);
  });

  it("shows an error notification instead when the capture fails", async () => {
    captureFromMenu(() => Promise.reject(new Error("UnknownVizError")));

    await waitFor(() =>
      expect(notificationsAtom.get()).toMatchObject([
        {
          kind: "error",
          message: "Failed to copy screenshot",
          details: "UnknownVizError",
        },
      ]),
    );
    expect(checkmarkShown()).toBe(false);
  });
});

describe("BrowserMenu copy URL", () => {
  afterEach(() => vi.useRealTimers());

  it("clears the checkmark even if its tab hides first", () => {
    vi.useFakeTimers();
    const inTab = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>{browserMenu()}</Activity>
    );
    const { rerender } = render(inTab("visible"));
    chooseFromMenu("Copy URL");
    expect(checkmarkShown()).toBe(true);

    rerender(inTab("hidden"));
    act(() => vi.advanceTimersByTime(2000));
    rerender(inTab("visible"));

    expect(checkmarkShown()).toBe(false);
  });
});

describe("BrowserMenu clear history", () => {
  const visited = {
    url: "https://example.com/",
    title: "Example",
    visitedAt: 1,
  };

  function menuWith(library: BrowserLibrary) {
    const queryClient = createQueryClient();
    queryClient.setQueryData(libraryQuery.queryKey, library);
    render(browserMenu(), { queryClient });
  }

  it("clears history once the user confirms", async () => {
    browser.clearHistory = vi.fn(async () => ({ favorites: [], history: [] }));
    menuWith({ favorites: [], history: [visited] });

    chooseFromMenu("Clear history…");
    const clear = await screen.findByRole("button", { name: "Clear" });
    expect(browser.clearHistory).not.toHaveBeenCalled();
    fireEvent.click(clear);

    await waitFor(() => expect(browser.clearHistory).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });

  it("can't clear history when there's none", () => {
    menuWith({ favorites: [], history: [] });

    fireEvent.keyDown(screen.getByLabelText("More options"), { key: "Enter" });

    expect(
      screen
        .getByRole("menuitem", { name: "Clear history…" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });
});
