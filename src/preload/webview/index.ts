import { ipcRenderer } from "electron";
import type {
  BrowserAutomationRequest,
  BrowserAutomationResponse,
} from "@shared/cli/browser";
import automation from "./api/automation";

ipcRenderer.on(
  "browser:request",
  async (_, request: BrowserAutomationRequest) => {
    const { requestId, command, args } = request ?? {};
    if (!requestId || !command || !(command in automation)) {
      return;
    }

    try {
      const result = await automation[command](args as never);
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
