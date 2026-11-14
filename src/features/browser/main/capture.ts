import { setTimeout as delay } from "node:timers/promises";
import type { Rectangle, WebContents } from "electron";

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
