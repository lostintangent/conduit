import { BrowserWindow } from "electron";
import { expect, it, vi } from "vitest";

vi.mock("electron", () => ({ BrowserWindow: { getAllWindows: vi.fn() } }));

import { emitter } from "../../src/main/events";

it("sends events to Conduit's window and not to popups that pages open", () => {
  const window = {
    webContents: { send: vi.fn() },
    getParentWindow: () => null,
  };
  const popup = {
    webContents: { send: vi.fn() },
    getParentWindow: () => window,
  };
  vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([
    popup,
    window,
  ] as unknown as BrowserWindow[]);

  emitter("workbench")("newTabRequested", undefined);

  expect(window.webContents.send).toHaveBeenCalledWith(
    "workbench:newTabRequested",
    undefined,
  );
  expect(popup.webContents.send).not.toHaveBeenCalled();
});
