import { ipcRenderer } from "electron";
import type {
  BrowserAutomationRequest,
  BrowserAutomationResponse,
} from "@shared/cli/browser";
import automation from "./api/automation";

ipcRenderer.on(
  "automation:invoke",
  async (_, payload: BrowserAutomationRequest) => {
    const { requestId, command, args } = payload ?? {};
    if (!requestId || !command || !(command in automation)) {
      return;
    }

    try {
      const result = await automation[command](args as never);
      const response: BrowserAutomationResponse = { requestId, result };
      ipcRenderer.sendToHost("automation:result", response);
    } catch (error: unknown) {
      const response: BrowserAutomationResponse = {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      };
      ipcRenderer.sendToHost("automation:result", response);
    }
  },
);
