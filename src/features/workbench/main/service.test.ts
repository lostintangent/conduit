import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vitest";

const emit = vi.fn();
const workAreaSize = { width: 1920, height: 1055 };
vi.mock("electron", () => ({
  clipboard: {},
  dialog: {},
  shell: {},
  screen: { getPrimaryDisplay: () => ({ workAreaSize }) },
}));
vi.mock("../../../main/events", () => ({
  emitter: () => emit,
  getAppWindow: () => undefined,
}));

const {
  default: service,
  pageSavedBeforeClose,
  fitScreen,
  showWhenOpened,
} = await import("./service");

function hiddenWindow() {
  return Object.assign(new EventEmitter(), {
    show: vi.fn(),
    isDestroyed: () => false,
  });
}

/** Lets the promises already resolved run their callbacks. */
const settle = () => new Promise(setImmediate);

describe("sizing the window", () => {
  it("keeps its size on a screen it fits", () => {
    expect(fitScreen(1024, 768)).toEqual({ width: 1024, height: 768 });
  });

  // macOS only shrinks a window too big for the screen when it shows it, by
  // when the hidden window's first shell has started at the bigger size.
  it("fits it in the screen's work area", () => {
    Object.assign(workAreaSize, { width: 1024, height: 675 });
    expect(fitScreen(1024, 768)).toEqual({ width: 1024, height: 675 });
  });
});

describe("showing the window", () => {
  it("waits for the page to paint the tabs it opens with", async () => {
    const window = hiddenWindow();
    showWhenOpened(window as unknown as BrowserWindow, 60_000);
    window.emit("ready-to-show");
    await settle();
    expect(window.show).not.toHaveBeenCalled();

    service.opened();
    await settle();
    expect(window.show).toHaveBeenCalledOnce();
  });

  it("waits for its first paint, even once the page has opened", async () => {
    const window = hiddenWindow();
    showWhenOpened(window as unknown as BrowserWindow, 60_000);
    service.opened();
    await settle();
    expect(window.show).not.toHaveBeenCalled();

    window.emit("ready-to-show");
    await settle();
    expect(window.show).toHaveBeenCalledOnce();
  });

  it("shows anyway when the page doesn't say it opened", async () => {
    const window = hiddenWindow();
    showWhenOpened(window as unknown as BrowserWindow, 10);
    window.emit("ready-to-show");
    await vi.waitFor(() => expect(window.show).toHaveBeenCalledOnce());
  });
});

describe("closing the window", () => {
  it("waits for the page to save, but not for a page that doesn't answer", async () => {
    const saved = pageSavedBeforeClose(60_000);
    expect(emit).toHaveBeenCalledWith("beforeClose", undefined);
    service.readyToClose();
    await saved;

    await pageSavedBeforeClose(10);
  });
});
