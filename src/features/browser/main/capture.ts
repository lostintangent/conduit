import { setTimeout as delay } from "node:timers/promises";
import { type Rectangle, type WebContents, webContents } from "electron";

const CAPTURE_ATTEMPTS = 10;
const CAPTURE_RETRY_MS = 100;

/** Looks up a page's contents by id, and throws if the page is gone. */
export function getWebContents(id: number) {
  const contents = webContents.fromId(id);
  if (!contents) {
    throw new Error(`No web contents with id ${id}.`);
  }
  return contents;
}

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
