import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (window as any).conduit = { ...(window as any).conduit, browser: {} };
});

import { BrowserPane } from "@features/browser/components/BrowserPane";
import { TooltipProvider } from "@/components/ui/tooltip";
import { render } from "../../../../tests/renderer/queryRender";

const nextFrames = async (count: number) => {
  for (let i = 0; i < count; i++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
};

function browserPane(isInPreview: boolean, isActive = false) {
  return (
    <TooltipProvider>
      <BrowserPane
        isActive={isActive}
        url="https://example.com"
        paneId="browser-1"
        tabId="tab-1"
        onUrlChange={vi.fn()}
        onTitleChange={vi.fn()}
        onContextMenu={vi.fn()}
        onHover={vi.fn()}
        disableInteraction={false}
        isInPreview={isInPreview}
        isDevToolsOpen={false}
        onToggleDevTools={vi.fn()}
        onHideToolbar={vi.fn()}
      />
    </TooltipProvider>
  );
}

describe("BrowserPane", () => {
  let webview: HTMLElement;

  beforeEach(() => {
    // The pane attaches to an existing webview with its ID
    webview = Object.assign(document.createElement("div"), {
      id: "browser-1",
      canGoBack: () => false,
      canGoForward: () => false,
      getTitle: () => "",
      getURL: () => "https://example.com",
      isLoading: () => false,
    });
    document.body.append(webview);
    // On screen, so a preview keeps following its position every frame
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(10, 10, 400, 300),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    webview.remove();
  });

  it("puts the webview back under the tab's overlays once the preview ends", async () => {
    const { rerender } = render(browserPane(true));
    await nextFrames(2);
    expect(webview.style.zIndex).toBe("10001");

    rerender(browserPane(false));
    await nextFrames(3);

    expect(webview.style.zIndex).toBe("1");
  });

  it("takes the keyboard back from its page when its tab is hidden", () => {
    const { unmount } = render(browserPane(false));
    webview.tabIndex = 0;
    webview.focus();

    unmount();

    expect(document.activeElement).not.toBe(webview);
  });

  it("focuses its page on return after the page was clicked", async () => {
    webview.tabIndex = 0;
    const { rerender } = render(browserPane(false, true));
    screen.getByPlaceholderText(/Enter URL/).focus();
    webview.dispatchEvent(
      Object.assign(new Event("ipc-message"), {
        channel: "browser:pointerdown",
      }),
    );

    rerender(browserPane(false, false));
    document.body.focus();
    rerender(browserPane(false, true));
    await nextFrames(1);

    expect(document.activeElement).toBe(webview);
  });
});
