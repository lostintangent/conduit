import { EventEmitter } from "node:events";
import { app as electronApp, type WebContents } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserNavigation } from "@shared/types/panes";
import { restoreAddress } from "../model";
import { restoreOnAttach, restorePages } from "./restore";

vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  return { app: new EventEmitter() };
});
const app = electronApp as unknown as EventEmitter;

const navigation: BrowserNavigation = {
  index: 1,
  entries: [
    { url: "https://a.com/", title: "A" },
    { url: "https://b.com/", title: "B", pageState: "scrolled" },
  ],
};

/** The app window, whose webviews' pages attach to it */
const window = new EventEmitter();
restorePages(window as unknown as WebContents);

/** Attaches a webview that starts at `src`, as Electron does. */
function attach(src: string, restore = vi.fn(async () => {})) {
  const params: Record<string, string> = { src };
  const page = {
    getType: () => "webview",
    isDestroyed: () => false,
    getURL: () => "",
    loadURL: vi.fn(async () => {}),
    navigationHistory: { restore },
  };
  window.emit("will-attach-webview", {}, {}, params);
  app.emit("web-contents-created", {}, page);
  window.emit("did-attach-webview", {}, page);
  return { params, page };
}

describe("restorePages", () => {
  beforeEach(() => restoreOnAttach(new Map([["p", navigation]])));

  it("gives a reopening page its history back instead of loading its address", () => {
    const { params, page } = attach(restoreAddress("p", "https://b.com/"));

    expect(params.src).toBeUndefined();
    expect(page.navigationHistory.restore).toHaveBeenCalledWith(navigation);
    expect(page.loadURL).not.toHaveBeenCalled();
  });

  it("restores a page's history once, and loads a page without one", () => {
    attach(restoreAddress("p", "https://b.com/"));

    const again = attach(restoreAddress("p", "https://b.com/"));
    expect(again.params.src).toBe("https://b.com/");
    expect(again.page.navigationHistory.restore).not.toHaveBeenCalled();

    const other = attach(restoreAddress("q", "https://c.com/"));
    expect(other.params.src).toBe("https://c.com/");
  });

  it("leaves other webviews alone", () => {
    const { params, page } = attach("https://c.com/");

    expect(params.src).toBe("https://c.com/");
    expect(page.navigationHistory.restore).not.toHaveBeenCalled();
  });

  it("loads the page's address when its history doesn't take", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { page } = attach(
      restoreAddress("p", "https://b.com/"),
      vi.fn(() => Promise.reject(new Error("Invalid navigation history"))),
    );

    await vi.waitFor(() =>
      expect(page.loadURL).toHaveBeenCalledWith("https://b.com/"),
    );
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });
});
