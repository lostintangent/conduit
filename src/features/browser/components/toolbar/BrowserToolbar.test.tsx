import { fireEvent, screen } from "@testing-library/react";
import { Activity, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/commands/hooks/useCommand", () => ({
  useCommand: () => ({ execute: vi.fn<() => Promise<void>>() }),
}));

import { BrowserToolbar } from "@features/browser/components/toolbar/BrowserToolbar";
import { TooltipProvider } from "@/ui/tooltip";
import { render } from "../../../../../tests/renderer/queryRender";

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
