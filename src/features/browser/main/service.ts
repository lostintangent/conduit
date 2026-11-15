import { ClipboardItem, clipboard } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { capturePage, getWebContents } from "./capture";

const service = {
  /** Copies a screenshot of the page to the clipboard. */
  async captureScreenshot(webContentsId: number): Promise<void> {
    const image = await capturePage(getWebContents(webContentsId));
    // Copy the bytes because TypeScript doesn't accept a Node Buffer as a BlobPart.
    const png = new Blob([new Uint8Array(image.toPNG())], {
      type: "image/png",
    });
    await clipboard.write([new ClipboardItem({ "image/png": png })]);
  },

  /** Saves a screenshot of the page to a temporary PNG and returns its path. */
  async saveScreenshot(webContentsId: number): Promise<string> {
    const image = await capturePage(getWebContents(webContentsId));
    const file = path.join(tmpdir(), `capture-${randomUUID()}.png`);
    await fs.writeFile(file, image.toPNG());
    return file;
  },

  /** Opens the page's DevTools inside the pane's own DevTools webview. */
  showDevTools(sourceWebContentsId: number, devToolsWebContentsId: number) {
    const sourceContents = getWebContents(sourceWebContentsId);
    const devToolsContents = getWebContents(devToolsWebContentsId);

    sourceContents.setDevToolsWebContents(devToolsContents);
    sourceContents.openDevTools();

    // DevTools first loads without its connection to the page, and a reload
    // in the same frame picks it up.
    // TODO: Remove this, along with the RenderDocument switch in main.ts, once
    // an Electron release shows a webview's DevTools with RenderDocument on.
    devToolsContents.executeJavaScript("window.location.reload()");
  },
};

export default service;

declare module "@shared/rpc" {
  interface Services {
    browser: typeof service;
  }
}
