import { beforeEach, describe, expect, it, vi } from "vitest";
import { openSidebarPage, sidebarBrowserUrlAtom, sidebarPage } from "./sidebar";
import {
  sidebarPaneIds,
  sidebarStateAtom,
} from "@features/workbench/client/sidebarStore";

const webview = () =>
  document.getElementById(sidebarPaneIds.browser()) as
    (HTMLElement & { src: string; clearHistory: () => void }) | null;

/** The sidebar's webview, on `url`. */
function showPage(url: string) {
  sidebarBrowserUrlAtom.set(url);
  const element = Object.assign(document.createElement("webview"), {
    src: url,
    clearHistory: vi.fn(),
  });
  element.id = sidebarPaneIds.browser();
  document.body.appendChild(element);
  return element;
}

beforeEach(() => {
  webview()?.remove();
  sidebarBrowserUrlAtom.set(() => undefined);
  sidebarStateAtom.set({ isOpen: false, view: "editor" });
});

describe("the sidebar's page", () => {
  it("saves with whether the sidebar shows it", () => {
    expect(sidebarPage()).toBeUndefined();

    sidebarBrowserUrlAtom.set("https://a.com/");
    expect(sidebarPage()).toEqual({ url: "https://a.com/", isOpen: false });

    sidebarStateAtom.set({ isOpen: true, view: "browser" });
    expect(sidebarPage()).toEqual({ url: "https://a.com/", isOpen: true });

    sidebarStateAtom.set({ isOpen: true, view: "editor" });
    expect(sidebarPage()).toEqual({ url: "https://a.com/", isOpen: false });
  });

  it("reopens a workspace's page without the last one in its history", () => {
    const page = showPage("https://a.com/");

    openSidebarPage({ url: "https://b.com/", isOpen: true });

    expect(page.src).toBe("https://b.com/");
    expect(sidebarBrowserUrlAtom.get()).toBe("https://b.com/");
    expect(sidebarStateAtom.get()).toEqual({ isOpen: true, view: "browser" });
    // Only once the new page is there
    expect(page.clearHistory).not.toHaveBeenCalled();
    page.dispatchEvent(new Event("did-navigate"));
    page.dispatchEvent(new Event("did-navigate"));
    expect(page.clearHistory).toHaveBeenCalledTimes(1);
  });

  it("keeps the page it shows when the workspace has the same one", () => {
    const page = showPage("https://a.com/");
    page.src = "https://a.com/moved-on";
    sidebarBrowserUrlAtom.set("https://a.com/moved-on");

    openSidebarPage({ url: "https://a.com/moved-on", isOpen: false });

    expect(page.src).toBe("https://a.com/moved-on");
    page.dispatchEvent(new Event("did-navigate"));
    expect(page.clearHistory).not.toHaveBeenCalled();
  });

  it("closes the sidebar's browser for a workspace without it open, and leaves its other views open", () => {
    const page = showPage("https://a.com/");
    sidebarStateAtom.set({ isOpen: true, view: "browser" });

    openSidebarPage(undefined);

    expect(page.src).toBe("about:blank");
    expect(sidebarBrowserUrlAtom.get()).toBeUndefined();
    expect(sidebarStateAtom.get().isOpen).toBe(false);

    sidebarStateAtom.set({ isOpen: true, view: "editor" });
    openSidebarPage({ url: "https://b.com/", isOpen: false });
    expect(sidebarStateAtom.get()).toEqual({ isOpen: true, view: "editor" });
  });

  it("leaves a page the sidebar hasn't shown yet for it to open", () => {
    openSidebarPage({ url: "https://b.com/", isOpen: false });

    expect(webview()).toBeNull();
    expect(sidebarPage()).toEqual({ url: "https://b.com/", isOpen: false });
  });
});
