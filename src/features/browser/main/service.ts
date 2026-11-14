import { ClipboardItem, clipboard, webContents } from "electron";
import { capturePage } from "./capture";

const service = {
  /** Copies a screenshot of the page to the clipboard. */
  async captureScreenshot(webContentsId: number): Promise<void> {
    const image = await capturePage(webContents.fromId(webContentsId));
    // Copy the bytes because TypeScript doesn't accept a Node Buffer as a BlobPart.
    const png = new Blob([new Uint8Array(image.toPNG())], {
      type: "image/png",
    });
    await clipboard.write([new ClipboardItem({ "image/png": png })]);
  },

  /** Opens the page's DevTools inside the pane's own DevTools webview. */
  showDevTools(sourceWebContentsId: number, devToolsWebContentsId: number) {
    const sourceContents = webContents.fromId(sourceWebContentsId);
    const devToolsContents = webContents.fromId(devToolsWebContentsId);

    sourceContents.setDevToolsWebContents(devToolsContents);
    sourceContents.openDevTools();

    // This is a needed workaround to ensure the DevTools reloads
    // properly when opened in a separate window. Unfortunately it's required :/
    devToolsContents.executeJavaScript("window.location.reload()");
  },
};

export default service;

declare module "@shared/rpc" {
  interface Services {
    browser: typeof service;
  }
}
