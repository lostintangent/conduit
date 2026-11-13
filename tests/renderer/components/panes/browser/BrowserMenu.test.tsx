/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/commands/hooks/useCommand", () => ({
  useCommand: () => ({ execute: vi.fn<() => Promise<void>>() }),
}));

import { BrowserMenu } from "@/components/panes/browser/toolbar/BrowserMenu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { notificationsAtom } from "@/store/atoms";

const store = getDefaultStore();

function captureFromMenu(onCaptureScreenshot: () => Promise<void>) {
  render(
    <TooltipProvider>
      <BrowserMenu
        currentPage={{ url: "https://example.com", title: "Example" }}
        isDevToolsOpen={false}
        onToggleDevTools={() => {}}
        onHideToolbar={() => {}}
        onCaptureScreenshot={onCaptureScreenshot}
        tabId="tab-1"
      />
    </TooltipProvider>,
  );

  fireEvent.keyDown(screen.getByLabelText("More options"), { key: "Enter" });
  fireEvent.click(screen.getByText("Copy screenshot"));
}

const checkmarkShown = () =>
  !!screen.getByLabelText("More options").querySelector(".text-green-500");

describe("BrowserMenu screenshot", () => {
  afterEach(() => store.set(notificationsAtom, []));

  it("shows the checkmark once the screenshot is copied", async () => {
    captureFromMenu(() => Promise.resolve());

    await waitFor(() => expect(checkmarkShown()).toBe(true));
    expect(store.get(notificationsAtom)).toEqual([]);
  });

  it("shows an error notification instead when the capture fails", async () => {
    captureFromMenu(() => Promise.reject(new Error("UnknownVizError")));

    await waitFor(() =>
      expect(store.get(notificationsAtom)).toMatchObject([
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
