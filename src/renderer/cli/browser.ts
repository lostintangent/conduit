import type {
  AutomationCommand,
  AutomationInvokePayload,
  AutomationResultPayload,
  ExtractAutomationCommand,
} from "@shared/cli/browser";
import type { WebviewTag } from "electron";

function getWebview(paneId: string) {
  const webview = document.getElementById(paneId) as WebviewTag | null;
  if (!webview) {
    throw new Error(`Browser pane ${paneId} not found.`);
  }
  return webview;
}

function sendAutomationCommand<T extends AutomationCommand["command"]>(
  webview: WebviewTag,
  command: T,
  args: Omit<ExtractAutomationCommand<T>["args"], "paneId">,
): Promise<ExtractAutomationCommand<T>["result"]> {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return new Promise((resolve, reject) => {
    const handleMessage = (
      event: Electron.IpcMessageEvent & { channel: string },
    ) => {
      if (event.channel !== "automation:result") return;
      const payload = event.args?.[0] as AutomationResultPayload<T> | undefined;
      if (!payload || payload.id !== requestId) return;

      webview.removeEventListener("ipc-message", handleMessage as any);
      if (payload.error) {
        reject(new Error(payload.error));
        return;
      }
      resolve(payload.result as ExtractAutomationCommand<T>["result"]);
    };

    webview.addEventListener("ipc-message", handleMessage as any);
    const invokePayload: AutomationInvokePayload<T> = {
      id: requestId,
      command,
      args: args as ExtractAutomationCommand<T>["args"],
    };
    webview.send("automation:invoke", invokePayload);
  });
}

export async function browserAutomate<T extends AutomationCommand["command"]>(
  command: T,
  payload: ExtractAutomationCommand<T>["args"],
): Promise<ExtractAutomationCommand<T>["result"]> {
  const { paneId, ...rest } = payload;

  if (!paneId) {
    throw new Error("Browser pane ID is required.");
  }

  const webview = getWebview(paneId);

  return sendAutomationCommand(webview, command, rest);
}
