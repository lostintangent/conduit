import { screen } from "@testing-library/react";
import { Activity } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/commands/hooks/useCommand", () => ({
  useCommand: () => ({ execute: vi.fn<() => Promise<void>>() }),
}));

import { BrowserToolbar } from "@features/browser/components/toolbar/BrowserToolbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { render } from "../../../../../tests/renderer/queryRender";

function blankToolbar(mode: "visible" | "hidden", isInPreview = false) {
  return (
    <TooltipProvider>
      <button type="button">Elsewhere</button>
      <Activity mode={mode}>
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
          isInPreview={isInPreview}
        />
      </Activity>
    </TooltipProvider>
  );
}

describe("BrowserToolbar with a blank page", () => {
  const urlInput = () => screen.getByPlaceholderText(/Enter URL/);

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
