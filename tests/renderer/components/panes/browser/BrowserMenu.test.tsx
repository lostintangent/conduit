import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/commands/hooks/useCommand", () => ({
  useCommand: () => ({ execute: vi.fn<() => Promise<void>>() }),
}));

import { BrowserMenu } from "@/components/panes/browser/toolbar/BrowserMenu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { notificationsAtom } from "@/store/atoms";

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
