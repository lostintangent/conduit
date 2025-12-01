import { ipcRenderer } from "electron";
import type {
  AutomationInvokePayload,
  AutomationResultPayload,
} from "@shared/cli/browser";
import automation from "./api/automation";

ipcRenderer.on(
  "automation:invoke",
  async (_, payload: AutomationInvokePayload) => {
    const { id, command, args } = payload ?? {};
    if (!id || !command || !(command in automation)) {
      return;
    }

    try {
      const result = await automation[command](args as never);
      const response: AutomationResultPayload = { id, result };
      ipcRenderer.sendToHost("automation:result", response);
    } catch (error: unknown) {
      const response: AutomationResultPayload = {
        id,
        error: error instanceof Error ? error.message : String(error),
      };
      ipcRenderer.sendToHost("automation:result", response);
    }
  },
);
