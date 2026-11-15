import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { Activity, type ComponentProps, createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/commands/hooks/useCommand", () => ({
  useCommand: () => ({ execute: vi.fn<() => Promise<void>>() }),
}));

import { createQueryClient } from "@/query";
import {
  BrowserToolbar,
  type BrowserToolbarHandle,
} from "@features/browser/components/toolbar/BrowserToolbar";
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
      onDismiss={() => {}}
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

const urlInput = () =>
  screen.getByPlaceholderText<HTMLInputElement>("Search or enter address");

describe("BrowserToolbar with a blank page", () => {
  it("focuses its URL once, not each time its tab shows again", () => {
    const { rerender } = render(blankToolbar("visible"));
    expect(document.activeElement).toBe(urlInput());
    expect(urlInput().value).toBe("");

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
    act(() => urlInput().focus());
    fireEvent.keyDown(urlInput(), { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(urlInput()).toHaveProperty("value", page.url);
  });
});

describe("BrowserToolbar's address field", () => {
  const page = { url: "https://example.com/", title: "Example" };

  /** A toolbar whose field has an address typed in */
  function typedIn(address: string) {
    const ref = createRef<BrowserToolbarHandle>();
    const onNavigate = vi.fn();
    const onDismiss = vi.fn();
    render(
      <TooltipProvider>
        {toolbar({ currentPage: page, onNavigate, onDismiss, ref })}
      </TooltipProvider>,
    );
    act(() => ref.current!.focusAddressBar());
    fireEvent.change(urlInput(), { target: { value: address } });
    return { onNavigate, onDismiss };
  }
  const submit = () => fireEvent.submit(urlInput().form!);

  it("goes to the address on Enter, and leaves the field for the page", () => {
    const { onNavigate, onDismiss } = typedIn("example.org");
    submit();
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith("https://example.org");
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("puts the page's address back on the first Escape, and leaves for the page on the second", () => {
    const { onDismiss } = typedIn("foo");
    fireEvent.keyDown(urlInput(), { key: "Escape" });
    expect(document.activeElement).toBe(urlInput());
    expect(urlInput()).toMatchObject({
      value: page.url,
      selectionStart: 0,
      selectionEnd: page.url.length,
    });
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.keyDown(urlInput(), { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledOnce();
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
  function toolbarWith(
    library: BrowserLibrary,
    props: Partial<ComponentProps<typeof BrowserToolbar>> = {},
  ) {
    const queryClient = createQueryClient();
    queryClient.setQueryData(libraryQuery.queryKey, library);
    render(
      <TooltipProvider>
        {toolbar({ currentPage: page, ...props })}
      </TooltipProvider>,
      {
        queryClient,
      },
    );
  }

  // Radix hides a popover it can't position, as in a test's DOM
  const suggested = () =>
    screen
      .queryAllByRole("option", { hidden: true })
      .map((option) => option.lastElementChild?.textContent);
  const favorite = (path: string) => ({
    url: `https://example.com/${path}`,
    title: path,
  });
  const urls = (...paths: string[]) =>
    paths.map((path) => `https://example.com/${path}`);

  it("suggests up to three favorites that match, then history, eight in all", () => {
    toolbarWith({
      favorites: ["f1", "f2", "f3", "f4"].map(favorite),
      history: ["h1", "f2", "h2", "h3", "h4", "h5", "h6", "h7"].map(visit),
    });

    fireEvent.change(urlInput(), { target: { value: "example" } });

    expect(suggested()).toEqual(
      urls("f1", "f2", "f3", "h1", "h2", "h3", "h4", "h5"),
    );
  });

  it("finds pages by their title", () => {
    toolbarWith({
      favorites: [{ url: "https://example.com/f", title: "Weather" }],
      history: [
        { url: "https://example.com/h", title: "Weather radar", visitedAt: 1 },
        visit("other"),
      ],
    });

    fireEvent.change(urlInput(), { target: { value: "weath" } });

    expect(suggested()).toEqual(urls("f", "h"));
  });

  it("suggests favorites, then recent pages, once the field is emptied", () => {
    toolbarWith({
      favorites: ["f1"].map(favorite),
      history: ["h2", "h1"].map(visit),
    });

    fireEvent.change(urlInput(), { target: { value: "" } });

    expect(suggested()).toEqual(urls("f1", "h2", "h1"));
  });

  it("shows the address without https:// or www. until it's focused", () => {
    const url = "https://www.example.com/one?two#three";
    const ref = createRef<BrowserToolbarHandle>();
    toolbarWith(
      { favorites: [], history: [] },
      { currentPage: { url, title: "One" }, ref },
    );
    expect(urlInput().value).toBe("example.com/one?two#three");

    act(() => ref.current!.focusAddressBar());

    expect(urlInput()).toMatchObject({
      value: url,
      selectionStart: 0,
      selectionEnd: url.length,
    });
    fireEvent.blur(urlInput());
    expect(urlInput().value).toBe("example.com/one?two#three");
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

    await waitFor(() => expect(suggested()).toEqual(urls("1")));
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
