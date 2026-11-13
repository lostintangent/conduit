import { setTimeout as delay } from "node:timers/promises";
import {
  clipboard,
  ipcMain,
  type Rectangle,
  type WebContents,
  webContents,
} from "electron";

const CAPTURE_ATTEMPTS = 10;
const CAPTURE_RETRY_MS = 100;

// Since Electron 41, capturePage rejects while a page has no frame to copy,
// which lasts a few dozen milliseconds after a webview loads or navigates.
export async function capturePage(contents: WebContents, rect?: Rectangle) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await contents.capturePage(rect);
    } catch (error) {
      if (attempt === CAPTURE_ATTEMPTS) throw error;
      await delay(CAPTURE_RETRY_MS);
    }
  }
}

export function initializeBrowserHandlers() {
  ipcMain.handle(
    "browser:capture-screenshot",
    async (_, webContentsId: number) => {
      const contents = webContents.fromId(webContentsId);
      const image = await capturePage(contents);
      clipboard.writeImage(image);
    },
  );

  ipcMain.handle(
    "browser:show-devtools",
    (_, sourceWebContentsId: number, devToolsWebContentsId: number) => {
      const sourceContents = webContents.fromId(sourceWebContentsId);
      const devToolsContents = webContents.fromId(devToolsWebContentsId);

      sourceContents.setDevToolsWebContents(devToolsContents);
      sourceContents.openDevTools();

      // This is a needed workaround to ensure the DevTools reloads
      // properly when opened in a separate window. Unfortunately it's required :/
      devToolsContents.executeJavaScript("window.location.reload()");
    },
  );
}
