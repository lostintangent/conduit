import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import type { WebviewTag } from "electron";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import { TooltipProvider } from "@/ui/tooltip";
import { FindBar, type FindBarHandle } from "./FindBar";

/** A page that counts its find requests, the way Electron numbers them */
function fakePage() {
  let requestId = 0;
  return Object.assign(document.createElement("div"), {
    findInPage: vi.fn(() => ++requestId),
    stopFindInPage: vi.fn(),
  });
}

type FakePage = ReturnType<typeof fakePage>;

/** The page reports what a find request found */
function found(
  page: FakePage,
  requestId: number,
  activeMatchOrdinal: number,
  matches: number,
) {
  act(() => {
    page.dispatchEvent(
      Object.assign(new Event("found-in-page"), {
        result: { requestId, activeMatchOrdinal, matches, finalUpdate: true },
      }),
    );
  });
}

describe("FindBar", () => {
  let page: FakePage;
  let bar: FindBarHandle;
  let onFocusPage: Mock<() => void>;

  const field = () =>
    screen.getByPlaceholderText<HTMLInputElement>("Find in page");
  const count = () => screen.getByRole("status").textContent;
  const type = (text: string) =>
    fireEvent.change(field(), { target: { value: text } });
  const searched = () => page.findInPage.mock.calls;

  beforeEach(() => {
    vi.useFakeTimers();
    page = fakePage();
    onFocusPage = vi.fn();
    const ref = createRef<FindBarHandle>();
    render(
      <TooltipProvider>
        <FindBar
          ref={ref}
          page={{ current: page as unknown as WebviewTag }}
          zIndex={2}
          follow={false}
          onFocus={vi.fn()}
          onFocusPage={onFocusPage}
        />
      </TooltipProvider>,
    );
    // Like the pane, which reads the latest handle each time
    bar = {
      open: () => ref.current!.open(),
      step: (forward) => ref.current!.step(forward),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("searches the page as the user types, and counts what it found", () => {
    act(() => bar.open());
    expect(document.activeElement).toBe(field());

    type("ca");
    type("cat");
    expect(searched()).toEqual([]);
    act(() => vi.advanceTimersByTime(100));
    expect(searched()).toEqual([["cat", { forward: true, findNext: true }]]);

    found(page, 1, 3, 12);
    expect(count()).toBe("3 of 12");
  });

  it("says when nothing matches, and nothing while the field is empty", () => {
    act(() => bar.open());
    expect(count()).toBe("");

    type("zebra");
    act(() => vi.advanceTimersByTime(100));
    found(page, 1, 0, 0);
    expect(count()).toBe("Not found");

    type("");
    act(() => vi.advanceTimersByTime(100));
    expect(page.stopFindInPage).toHaveBeenCalledWith("clearSelection");
    expect(count()).toBe("");
  });

  it("goes to the next match with Enter, and the previous one with Shift+Enter", () => {
    act(() => bar.open());
    type("cat");
    act(() => vi.advanceTimersByTime(100));
    page.findInPage.mockClear();

    fireEvent.keyDown(field(), { key: "Enter" });
    fireEvent.keyDown(field(), { key: "Enter", shiftKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    act(() => bar.step(true));

    expect(searched()).toEqual([
      ["cat", { forward: true, findNext: false }],
      ["cat", { forward: false, findNext: false }],
      ["cat", { forward: true, findNext: false }],
      ["cat", { forward: false, findNext: false }],
      ["cat", { forward: true, findNext: false }],
    ]);
  });

  it("searches right away when Enter comes before the search would", () => {
    act(() => bar.open());
    type("cat");
    fireEvent.keyDown(field(), { key: "Enter" });
    act(() => vi.advanceTimersByTime(100));

    expect(searched()).toEqual([["cat", { forward: true, findNext: true }]]);
  });

  it("counts only what the latest search found", () => {
    act(() => bar.open());
    type("ca");
    act(() => vi.advanceTimersByTime(100));
    type("cat");
    act(() => vi.advanceTimersByTime(100));

    found(page, 2, 1, 4);
    found(page, 1, 1, 9);
    expect(count()).toBe("1 of 4");

    // A step goes on with the same search
    fireEvent.keyDown(field(), { key: "Enter" });
    found(page, 3, 2, 4);
    expect(count()).toBe("2 of 4");
  });

  it("closes with Escape, leaving the match selected, and gives the page focus", () => {
    act(() => bar.open());
    type("cat");
    act(() => vi.advanceTimersByTime(100));

    fireEvent.keyDown(field(), { key: "Escape" });

    expect(screen.queryByPlaceholderText("Find in page")).toBeNull();
    expect(page.stopFindInPage).toHaveBeenCalledWith("keepSelection");
    expect(onFocusPage).toHaveBeenCalled();
  });

  it("keeps the field focused when its buttons are clicked, and closes with Escape from them", () => {
    act(() => bar.open());
    const next = screen.getByRole("button", { name: "Next" });

    expect(fireEvent.mouseDown(next)).toBe(false);

    // Where the keyboard can still take focus
    next.focus();
    fireEvent.keyDown(next, { key: "Escape" });
    expect(screen.queryByPlaceholderText("Find in page")).toBeNull();
    expect(onFocusPage).toHaveBeenCalled();
  });

  it("opens again with the last text selected, leaving the page where it is", () => {
    act(() => bar.open());
    type("cat");
    act(() => vi.advanceTimersByTime(100));
    found(page, 1, 1, 3);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    page.findInPage.mockClear();

    act(() => bar.open());

    expect(field()).toHaveProperty("value", "cat");
    expect(document.activeElement).toBe(field());
    expect([field().selectionStart, field().selectionEnd]).toEqual([0, 3]);
    // A new search would go on from the match left selected
    expect(searched()).toEqual([]);
    expect(count()).toBe("");

    // Opening it while it's open selects the text again
    field().setSelectionRange(3, 3);
    act(() => bar.open());
    expect([field().selectionStart, field().selectionEnd]).toEqual([0, 3]);
  });

  it("opens to go to the next match while it's closed", () => {
    act(() => bar.step(true));
    expect(document.activeElement).toBe(field());
    expect(searched()).toEqual([]);

    type("cat");
    fireEvent.keyDown(field(), { key: "Escape" });
    act(() => bar.step(false));

    expect(document.activeElement).toBe(field());
    expect(searched()).toEqual([["cat", { forward: false, findNext: true }]]);
  });

  it("closes when its page goes to another page, but not when the page moves within itself", () => {
    act(() => bar.open());
    type("cat");

    act(() => {
      page.dispatchEvent(new Event("did-navigate-in-page"));
    });
    expect(field()).toBeTruthy();

    act(() => {
      page.dispatchEvent(new Event("did-navigate"));
    });
    expect(screen.queryByPlaceholderText("Find in page")).toBeNull();
    // Focus left with the field
    expect(onFocusPage).toHaveBeenCalled();
    // And the search that was waiting doesn't run on the new page
    act(() => vi.advanceTimersByTime(100));
    expect(searched()).toEqual([]);
  });

  it("leaves focus alone when its page goes to another page while the user is elsewhere", () => {
    act(() => bar.open());
    field().blur();

    act(() => {
      page.dispatchEvent(new Event("did-navigate"));
    });

    expect(screen.queryByPlaceholderText("Find in page")).toBeNull();
    expect(onFocusPage).not.toHaveBeenCalled();
  });
});
