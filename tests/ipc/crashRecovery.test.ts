import type { BrowserWindow } from "electron";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  app: { quit: vi.fn() },
  dialog: { showMessageBox: vi.fn() },
}));
vi.mock("electron", () => electron);

import { reloadAfterCrashes } from "../../src/ipc/crashRecovery";

function createWindow() {
  const webContents = Object.assign(new EventEmitter(), { reload: vi.fn() });
  const window = Object.assign(new EventEmitter(), {
    webContents,
    isDestroyed: () => false,
  });
  reloadAfterCrashes(window as unknown as BrowserWindow);

  return {
    window,
    reload: webContents.reload,
    async die(reason = "crashed", afterMs = 0) {
      vi.setSystemTime(Date.now() + afterMs);
      webContents.emit("render-process-gone", {}, { reason, exitCode: 1 });
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

describe("crash recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("reloads a page that dies, unless it exited cleanly or the window is closing", async () => {
    const { window, reload, die } = createWindow();

    await die("crashed");
    expect(reload).toHaveBeenCalledTimes(1);

    await die("clean-exit", 120_000);
    expect(reload).toHaveBeenCalledTimes(1);

    window.emit("close");
    await die("killed", 120_000);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(electron.dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it("asks before reloading a page that dies again within a minute", async () => {
    const { reload, die } = createWindow();
    await die("crashed");
    expect(reload).toHaveBeenCalledTimes(1);

    electron.dialog.showMessageBox.mockResolvedValueOnce({ response: 0 });
    await die("oom", 59_000);
    expect(electron.dialog.showMessageBox).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(2);

    await die("crashed", 61_000);
    expect(electron.dialog.showMessageBox).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(3);

    electron.dialog.showMessageBox.mockResolvedValueOnce({ response: 1 });
    await die("crashed", 59_000);
    expect(electron.dialog.showMessageBox).toHaveBeenCalledTimes(2);
    expect(electron.app.quit).toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(3);
  });
});
