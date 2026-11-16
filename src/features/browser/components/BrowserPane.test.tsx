import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";

const { requestNewPage } = vi.hoisted(() => {
  const listeners = new Set<(payload: unknown) => void>();
  (window as any).conduit = {
    ...(window as any).conduit,
    browser: {
      on: (_event: string, listener: (payload: unknown) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
  return {
    requestNewPage: (payload: object) => {
      for (const listener of listeners) listener(payload);
    },
  };
});

import { BrowserPane } from "@features/browser/components/BrowserPane";
import { getBrowserPaneHandlers } from "@features/browser/client/paneHandlers";
import { focusPageOnOpen } from "@features/browser/client/webview";
import { TooltipProvider } from "@/ui/tooltip";
import { render } from "../../../../tests/renderer/queryRender";

const nextFrames = async (count: number) => {
  for (let i = 0; i < count; i++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
};

function browserPane(
  isInPreview: boolean,
  isActive = false,
  onOpenPage?: (url: string, background: boolean) => void,
  url = "https://example.com",
  onContextMenu = vi.fn(),
) {
  return (
    <TooltipProvider>
      <BrowserPane
        isActive={isActive}
        onOpenPage={onOpenPage}
        url={url}
        paneId="browser-1"
        tabId="tab-1"
        onUrlChange={vi.fn()}
        onTitleChange={vi.fn()}
        onContextMenu={onContextMenu}
        onHover={vi.fn()}
        isResizing={false}
        isInPreview={isInPreview}
        isDevToolsOpen={false}
        onToggleDevTools={vi.fn()}
        onHideToolbar={vi.fn()}
      />
    </TooltipProvider>
  );
}

const attachingPane = (onAttach: (webContentsId: number) => void) => (
  <TooltipProvider>
    <BrowserPane
      url="https://example.com"
      paneId="browser-1"
      tabId="tab-1"
      onAttach={onAttach}
      onUrlChange={vi.fn()}
      onTitleChange={vi.fn()}
      onContextMenu={vi.fn()}
      onHover={vi.fn()}
      isResizing={false}
      isInPreview={false}
      isDevToolsOpen={false}
      onToggleDevTools={vi.fn()}
      onHideToolbar={vi.fn()}
    />
  </TooltipProvider>
);

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
      getWebContentsId: () => 7,
      isLoading: () => false,
      loadURL: vi.fn(async () => {}),
      reload: vi.fn(),
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
    screen.getByPlaceholderText("Search or enter address").focus();
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

  it("gives the keyboard to a page the user just opened, and only then", async () => {
    webview.tabIndex = 0;
    focusPageOnOpen("browser-1");
    const { unmount } = render(browserPane(false, true));
    webview.dispatchEvent(new Event("did-attach"));
    await nextFrames(1);
    expect(document.activeElement).toBe(webview);

    // Like when its tab is shown again after the app restarts
    unmount();
    render(browserPane(false, true));
    await nextFrames(1);
    expect(document.activeElement).not.toBe(webview);
  });

  it("holds the keyboard for a page the user just opened until it attaches", async () => {
    webview.tabIndex = 0;
    // Its web contents can come a moment before it attaches, which is
    // too early to give it the keys
    focusPageOnOpen("browser-1");
    render(browserPane(false, true));
    await nextFrames(1);
    expect(document.activeElement).toBe(
      screen
        .getByPlaceholderText("Search or enter address")
        .closest("[tabindex='-1']"),
    );

    webview.dispatchEvent(new Event("did-attach"));

    expect(document.activeElement).toBe(webview);
  });

  for (const attached of [true, false]) {
    it(`gives the keyboard back on each return to a page it gave it to ${attached ? "on opening" : "once attached"}`, async () => {
      webview.tabIndex = 0;
      // Like a real webview, which has no focus event when it's given focus
      webview.addEventListener(
        "focus",
        (event) => event.stopImmediatePropagation(),
        true,
      );
      focusPageOnOpen("browser-1");
      const { rerender } = render(browserPane(false, true));
      if (attached) webview.dispatchEvent(new Event("did-attach"));
      await nextFrames(1);
      if (!attached) webview.dispatchEvent(new Event("did-attach"));
      expect(document.activeElement).toBe(webview);

      for (let i = 0; i < 2; i++) {
        rerender(browserPane(false, false));
        document.body.focus();
        rerender(browserPane(false, true));
        await nextFrames(1);
        expect(document.activeElement).toBe(webview);
      }
    });
  }

  it("tells its pane its page's id when the id comes after the page attaches", async () => {
    // Electron dispatches did-attach and replies with the id separately
    let id: number | undefined;
    Object.assign(webview, {
      getWebContentsId: () => {
        if (id === undefined) throw new Error("The WebView must be attached");
        return id;
      },
    });
    const onAttach = vi.fn();
    render(attachingPane(onAttach));
    webview.dispatchEvent(new Event("did-attach"));
    expect(onAttach).not.toHaveBeenCalled();

    id = 7;
    await waitFor(() => expect(onAttach).toHaveBeenCalled());
    expect(onAttach.mock.calls).toEqual([[7]]);
  });

  it("tells its pane its page's id on return when it left before the id came", () => {
    let id: number | undefined;
    Object.assign(webview, {
      getWebContentsId: () => {
        if (id === undefined) throw new Error("The WebView must be attached");
        return id;
      },
    });
    const onAttach = vi.fn();
    const { unmount } = render(attachingPane(onAttach));
    webview.dispatchEvent(new Event("did-attach"));
    unmount();

    id = 7;
    render(attachingPane(onAttach));
    expect(onAttach.mock.calls).toEqual([[7]]);
  });

  it("gives its page's right-click to the latest menu handler", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(
      browserPane(false, true, undefined, undefined, first),
    );
    rerender(browserPane(false, true, undefined, undefined, latest));

    const params = { x: 20, y: 40 };
    webview.dispatchEvent(Object.assign(new Event("context-menu"), { params }));

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(params);
  });

  it("opens the links its own page meant for a new tab", () => {
    const onOpenPage = vi.fn();
    render(browserPane(false, true, onOpenPage));

    requestNewPage({
      webContentsId: 8,
      url: "https://other.com",
      background: false,
    });
    requestNewPage({
      webContentsId: 7,
      url: "https://docs.com",
      background: true,
    });

    expect(onOpenPage.mock.calls).toEqual([["https://docs.com", true]]);
  });

  // The pane's address follows its page, and loading it again would replace a
  // page that's mid-redirect or was restored with its history
  it("leaves its page alone when the pane's address changes", () => {
    const { rerender } = render(browserPane(false, true));

    rerender(browserPane(false, true, undefined, "https://docs.com"));

    expect((webview as any).loadURL).not.toHaveBeenCalled();
  });

  // A sidebar reopened by a link renders its last URL once more, while its
  // page is already on the link
  it("shows its page's own address when it returns to an existing page", () => {
    render(browserPane(false, true, undefined, "https://stale.com"));

    expect(
      screen.getByPlaceholderText("Search or enter address"),
    ).toHaveProperty("value", "example.com");
  });

  it("loads a link meant for a new tab itself when it has nowhere to open it", () => {
    render(browserPane(false, true));

    requestNewPage({
      webContentsId: 7,
      url: "https://docs.com",
      background: false,
    });

    expect((webview as any).loadURL).toHaveBeenCalledWith("https://docs.com");
  });

  /** Has the page fail to load, the way Chromium reports it */
  const failLoad = (
    errorCode: number,
    errorDescription = "ERR_NAME_NOT_RESOLVED",
    isMainFrame = true,
  ) =>
    act(() => {
      webview.dispatchEvent(
        Object.assign(new Event("did-fail-load"), {
          errorCode,
          errorDescription,
          validatedURL: "https://nowhere.example/docs",
          isMainFrame,
        }),
      );
    });

  it("says why its page didn't load in its place, and keeps the address", () => {
    render(browserPane(false, true));

    failLoad(-105);

    screen.getByRole("heading", { name: "Can't Find the Server" });
    screen.getByText(
      (_, element) =>
        element?.textContent === "Conduit can't find nowhere.example.",
    );
    screen.getByText("ERR_NAME_NOT_RESOLVED");
    expect(webview.style.visibility).toBe("hidden");
    expect(
      screen.getByPlaceholderText("Search or enter address"),
    ).toHaveProperty("value", "nowhere.example/docs");
  });

  it("names the failure", () => {
    render(browserPane(false, true));
    const headline = (errorCode: number) => {
      failLoad(errorCode);
      return screen.getByRole("heading").textContent;
    };

    expect(headline(-102)).toBe("Can't Connect to the Server");
    expect(headline(-109)).toBe("Can't Connect to the Server");
    expect(headline(-106)).toBe("You're Not Connected to the Internet");
    expect(headline(-118)).toBe("The Server Took Too Long to Respond");
    expect(headline(-310)).toBe("Can't Open This Page");
  });

  it("leaves out a load that was stopped, and a frame in the page that didn't load", () => {
    render(browserPane(false, true));

    failLoad(-3, "ERR_ABORTED");
    failLoad(-105, "ERR_NAME_NOT_RESOLVED", false);

    expect(screen.queryByRole("heading")).toBeNull();
    expect(webview.style.visibility).toBe("");
  });

  it("tries the page again without dimming the message, and shows the page once it loads", () => {
    render(browserPane(false, true));
    failLoad(-102, "ERR_CONNECTION_REFUSED");

    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    act(() => {
      webview.dispatchEvent(new Event("did-start-loading"));
    });

    expect((webview as any).reload).toHaveBeenCalled();
    expect(document.querySelector(".animate-spin")).toBeNull();

    act(() => {
      webview.dispatchEvent(
        Object.assign(new Event("did-navigate"), {
          url: "https://nowhere.example/docs",
        }),
      );
    });

    expect(screen.queryByRole("heading")).toBeNull();
    expect(webview.style.visibility).toBe("");
  });

  it("still says why its page didn't load when its tab shows again", () => {
    const { unmount } = render(browserPane(false, true));
    failLoad(-105);
    unmount();
    Object.assign(webview, { getURL: () => "https://nowhere.example/docs" });

    render(browserPane(false, true));

    screen.getByRole("heading", { name: "Can't Find the Server" });
    expect(webview.style.visibility).toBe("hidden");
  });

  it("shows its page when the page moved on while its tab was hidden", () => {
    const { unmount } = render(browserPane(false, true));
    failLoad(-105);
    unmount();
    Object.assign(webview, { getURL: () => "https://example.com/" });

    render(browserPane(false, true));

    expect(screen.queryByRole("heading")).toBeNull();
    expect(webview.style.visibility).toBe("");
  });

  it("finds in its page from its commands, and keeps focus where find left it", async () => {
    webview.tabIndex = 0;
    // Like Electron, which fires no focus event when the app focuses a page
    const appFocus = (event: FocusEvent) => {
      if (event.target === webview) event.stopImmediatePropagation();
    };
    window.addEventListener("focus", appFocus, true);
    onTestFinished(() => window.removeEventListener("focus", appFocus, true));
    Object.assign(webview, {
      findInPage: vi.fn(() => 1),
      stopFindInPage: vi.fn(),
    });
    const { rerender } = render(browserPane(false, true));
    const pane = getBrowserPaneHandlers("browser-1")!;

    act(() => pane.find());
    const field = screen.getByPlaceholderText("Find in page");
    fireEvent.change(field, { target: { value: "cat" } });
    fireEvent.keyDown(field, { key: "Enter" });
    act(() => pane.findPrevious());
    act(() => pane.findNext());
    expect((webview as any).findInPage.mock.calls).toEqual([
      ["cat", { forward: true, findNext: true }],
      ["cat", { forward: false, findNext: false }],
      ["cat", { forward: true, findNext: false }],
    ]);

    // Back in the field after another pane had focus
    rerender(browserPane(false, false));
    document.body.focus();
    rerender(browserPane(false, true));
    await nextFrames(1);
    expect(document.activeElement).toBe(field);

    // And in the page once find closes
    fireEvent.keyDown(field, { key: "Escape" });
    expect(document.activeElement).toBe(webview);
    rerender(browserPane(false, false));
    document.body.focus();
    rerender(browserPane(false, true));
    await nextFrames(1);
    expect(document.activeElement).toBe(webview);
  });

  it("gives its page the keys from the address bar, on Enter and on a second Escape", async () => {
    webview.tabIndex = 0;
    // Like Electron, which fires no focus event when the app focuses a page
    const appFocus = (event: FocusEvent) => {
      if (event.target === webview) event.stopImmediatePropagation();
    };
    window.addEventListener("focus", appFocus, true);
    onTestFinished(() => window.removeEventListener("focus", appFocus, true));
    const { rerender } = render(browserPane(false, true));
    const field = screen.getByPlaceholderText<HTMLInputElement>(
      "Search or enter address",
    );

    act(() => field.focus());
    fireEvent.change(field, { target: { value: "example.org" } });
    fireEvent.submit(field.form!);
    expect((webview as any).loadURL).toHaveBeenCalledWith(
      "https://example.org",
    );
    expect(document.activeElement).toBe(webview);
    // And keeps them on return
    rerender(browserPane(false, false));
    document.body.focus();
    rerender(browserPane(false, true));
    await nextFrames(1);
    expect(document.activeElement).toBe(webview);

    act(() => field.focus());
    fireEvent.change(field, { target: { value: "foo" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(document.activeElement).toBe(field);
    fireEvent.keyDown(field, { key: "Escape" });
    expect(document.activeElement).toBe(webview);
  });

  // The page it's leaving is still the current one until then
  it("shows the address it went to until that page is there, or it stops loading without one", () => {
    render(browserPane(false, true));
    const field = screen.getByPlaceholderText<HTMLInputElement>(
      "Search or enter address",
    );
    const goTo = (address: string) => {
      act(() => field.focus());
      fireEvent.change(field, { target: { value: address } });
      fireEvent.submit(field.form!);
      act(() => {
        webview.dispatchEvent(new Event("did-start-loading"));
      });
    };
    const stopLoading = () =>
      act(() => {
        webview.dispatchEvent(new Event("did-stop-loading"));
      });

    goTo("example.org");
    expect(field.value).toBe("example.org");
    act(() => getBrowserPaneHandlers("browser-1")!.focusAddressBar());
    expect(field.value).toBe("https://example.org");
    act(() => {
      webview.dispatchEvent(
        Object.assign(new Event("did-navigate"), {
          url: "https://example.org/",
        }),
      );
    });
    expect(field.value).toBe("https://example.org/");

    stopLoading();

    // Like a download
    goTo("example.org/file.zip");
    expect(field.value).toBe("example.org/file.zip");
    stopLoading();
    expect(field.value).toBe("example.org/");
  });

  it("hides find while its tab is in a preview", () => {
    Object.assign(webview, {
      findInPage: vi.fn(() => 1),
      stopFindInPage: vi.fn(),
    });
    const { rerender } = render(browserPane(false, true));
    act(() => getBrowserPaneHandlers("browser-1")!.find());

    rerender(browserPane(true, true));
    expect(screen.queryByPlaceholderText("Find in page")).toBeNull();

    rerender(browserPane(false, true));
    screen.getByPlaceholderText("Find in page");
  });
});
