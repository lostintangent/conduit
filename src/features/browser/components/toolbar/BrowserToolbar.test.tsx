import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Activity, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/commands/hooks/useCommand", () => ({
  useCommand: () => ({ execute: vi.fn<() => Promise<void>>() }),
}));

import { createQueryClient } from "@/query";
import { BrowserToolbar } from "@features/browser/components/toolbar/BrowserToolbar";
import { libraryQuery } from "@features/browser/client/queries";
import type { BrowserLibrary } from "@features/browser/model";
import { TooltipProvider } from "@/ui/tooltip";
import { render } from "../../../../../tests/renderer/queryRender";

/** Main's browser service, with an empty library unless a test says otherwise */
let browser: Record<string, (...args: any[]) => Promise<BrowserLibrary>>;
beforeEach(() => {
  browser = { getLibrary: async () => ({ favorites: [], history: [] }) };
  (window as any).conduit = { browser };
});
afterEach(() => delete (window as any).conduit);

function toolbar(props: Partial<ComponentProps<typeof BrowserToolbar>>) {
  return (
    <BrowserToolbar
      currentPage={{ url: "about:blank", title: "" }}
      isLoading={false}
      canGoBack={false}
      canGoForward={false}
      consoleErrors={[]}
      onClearConsoleErrors={() => {}}
      onRemoveConsoleError={() => {}}
      onNavigate={() => {}}
      onGoBack={() => {}}
      onGoForward={() => {}}
      onRefresh={() => {}}
      onStop={() => {}}
      isDevToolsOpen={false}
      onToggleDevTools={() => {}}
      onHideToolbar={() => {}}
      onCaptureScreenshot={() => Promise.resolve()}
      {...props}
    />
  );
}

function blankToolbar(mode: "visible" | "hidden", isInPreview = false) {
  return (
    <TooltipProvider>
      <button type="button">Elsewhere</button>
      <Activity mode={mode}>{toolbar({ isInPreview })}</Activity>
    </TooltipProvider>
  );
}

const urlInput = () => screen.getByPlaceholderText(/Enter URL/);

describe("BrowserToolbar with a blank page", () => {
  it("focuses its URL once, not each time its tab shows again", () => {
    const { rerender } = render(blankToolbar("visible"));
    expect(document.activeElement).toBe(urlInput());

    screen.getByText("Elsewhere").focus();
    rerender(blankToolbar("hidden"));
    rerender(blankToolbar("visible"));

    expect(document.activeElement).toBe(screen.getByText("Elsewhere"));
  });

  it("waits to focus its URL until it's shown outside a preview", () => {
    const { rerender } = render(blankToolbar("visible", true));
    expect(document.activeElement).toBe(document.body);

    rerender(blankToolbar("visible"));
    expect(document.activeElement).toBe(urlInput());
  });
});

// A pane shows its hidden toolbar for Cmd+L until focus leaves it
describe("BrowserToolbar shown for its address bar", () => {
  const page = { url: "https://example.com/", title: "Example" };
  afterEach(() => vi.useRealTimers());

  function revealedToolbar() {
    const onDismiss = vi.fn();
    const onFocusLeave = vi.fn();
    render(
      <TooltipProvider>
        <button type="button">Elsewhere</button>
        {toolbar({ currentPage: page, onDismiss, onFocusLeave })}
      </TooltipProvider>,
    );
    return { onDismiss, onFocusLeave };
  }

  it("says when focus leaves it, not when focus moves to its buttons", () => {
    vi.useFakeTimers();
    const { onFocusLeave } = revealedToolbar();
    urlInput().focus();
    screen.getByRole("button", { name: "Refresh" }).focus();
    vi.runAllTimers();
    expect(onFocusLeave).not.toHaveBeenCalled();

    urlInput().focus();
    screen.getByText("Elsewhere").focus();
    vi.runAllTimers();
    expect(onFocusLeave).toHaveBeenCalledOnce();
  });

  // A window that loses focus leaves its active element where it was
  it("stays when the window loses focus", () => {
    vi.useFakeTimers();
    const { onFocusLeave } = revealedToolbar();
    urlInput().focus();
    fireEvent.focusOut(urlInput());
    vi.runAllTimers();
    expect(onFocusLeave).not.toHaveBeenCalled();
  });

  it("is dismissed by Escape, which keeps the address", () => {
    const { onDismiss } = revealedToolbar();
    urlInput().focus();
    fireEvent.keyDown(urlInput(), { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(urlInput()).toHaveProperty("value", page.url);
  });
});

describe("BrowserToolbar's history and favorites", () => {
  const page = { url: "https://example.com/", title: "Example" };
  const visit = (path: string) => ({
    url: `https://example.com/${path}`,
    title: path,
    visitedAt: 1,
  });

  /** A toolbar whose library has already loaded, as it has once the app's up */
  function toolbarWith(library: BrowserLibrary) {
    const queryClient = createQueryClient();
    queryClient.setQueryData(libraryQuery.queryKey, library);
    render(
      <TooltipProvider>{toolbar({ currentPage: page })}</TooltipProvider>,
      {
        queryClient,
      },
    );
  }

  // Radix hides a popover it can't position, as in a test's DOM, and a hidden
  // button's text isn't its name
  const suggested = () =>
    screen
      .queryAllByRole("button", { hidden: true })
      .map(({ textContent }) => textContent)
      .filter((text) => text?.startsWith("https://example.com/"));

  it("suggests the latest five pages the user visited", () => {
    toolbarWith({
      favorites: [],
      history: ["6", "5", "4", "3", "2", "1"].map(visit),
    });

    fireEvent.change(urlInput(), { target: { value: "example" } });

    expect(suggested()).toEqual(
      ["6", "5", "4", "3", "2"].map((path) => `https://example.com/${path}`),
    );
  });

  it("removes a page from history", async () => {
    browser.removeFromHistory = vi.fn(async () => ({
      favorites: [],
      history: [visit("1")],
    }));
    toolbarWith({ favorites: [], history: [visit("2"), visit("1")] });
    fireEvent.change(urlInput(), { target: { value: "example" } });

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Remove from history",
        hidden: true,
      })[0],
    );

    await waitFor(() => expect(suggested()).toEqual(["https://example.com/1"]));
    expect(browser.removeFromHistory).toHaveBeenCalledWith(
      "https://example.com/2",
    );
  });

  it("stars the page in the browser's favorites", async () => {
    browser.addFavorite = vi.fn(async () => ({
      favorites: [page],
      history: [],
    }));
    toolbarWith({ favorites: [], history: [] });

    fireEvent.click(screen.getByRole("button", { name: "Star this page" }));

    await screen.findByRole("button", { name: "Unstar this page" });
    expect(browser.addFavorite).toHaveBeenCalledWith(page);
  });
});
