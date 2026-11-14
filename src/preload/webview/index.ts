import type {
  BrowserAutomationRequest,
  BrowserAutomationResponse,
} from "@shared/cli/browser";
import { ipcRenderer } from "electron";
import automation from "./api/automation";
import { handAppKeys } from "./appKeys";

ipcRenderer.on(
  "browser:request",
  async (_, request: BrowserAutomationRequest) => {
    const { requestId, name, args } = request ?? {};
    if (!requestId || !name || !(name in automation)) {
      return;
    }

    try {
      const result = await automation[name](args as never);
      const response: BrowserAutomationResponse = { requestId, result };
      ipcRenderer.sendToHost("browser:response", response);
    } catch (error: unknown) {
      const response: BrowserAutomationResponse = {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      };
      ipcRenderer.sendToHost("browser:response", response);
    }
  },
);

// Tell the pane when the user presses on its page, so it activates like a pane
// clicked in the app. The <webview> element gets no event for it, and none when
// focus moves from one webview to another. Untrusted events come from scripts,
// like the automation API's clicks, and shouldn't move the user's focus.
window.addEventListener(
  "pointerdown",
  (event) => {
    if (event.isTrusted) ipcRenderer.sendToHost("browser:pointerdown");
  },
  { capture: true },
);

handAppKeys();
