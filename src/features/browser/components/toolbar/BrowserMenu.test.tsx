import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Activity } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/commands/hooks/useCommand", () => ({
  useCommand: () => ({ execute: vi.fn<() => Promise<void>>() }),
}));

import { BrowserMenu } from "@features/browser/components/toolbar/BrowserMenu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { notificationsAtom } from "@/store/atoms";

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
