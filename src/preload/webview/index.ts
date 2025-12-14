import type {
  BrowserAutomationRequest,
  BrowserAutomationResponse,
} from "@shared/cli/browser";
import { ipcRenderer } from "electron";
import automation from "./api/automation";

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
