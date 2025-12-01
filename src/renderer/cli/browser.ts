import type {
  BrowserAutomationCommand,
  BrowserAutomationRequest,
  BrowserAutomationResponse,
  ExtractBrowserAutomationCommand,
} from "@shared/cli/browser";
import type { WebviewTag } from "electron";

function getWebview(paneId: string) {
  const webview = document.getElementById(paneId) as WebviewTag | null;
  if (!webview) {
    throw new Error(`Browser pane ${paneId} not found.`);
  }
  return webview;
}

function sendAutomationCommand<T extends BrowserAutomationCommand["command"]>(
  webview: WebviewTag,
  command: T,
  args: Omit<ExtractBrowserAutomationCommand<T>["args"], "paneId">,
): Promise<ExtractBrowserAutomationCommand<T>["result"]> {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return new Promise((resolve, reject) => {
    const handleMessage = (
      event: Electron.IpcMessageEvent & { channel: string },
    ) => {
      if (event.channel !== "automation:result") return;
      const payload = event.args?.[0] as
        | BrowserAutomationResponse<T>
        | undefined;
      if (!payload || payload.requestId !== requestId) return;

      webview.removeEventListener("ipc-message", handleMessage as any);
      if (payload.error) {
        reject(new Error(payload.error));
        return;
      }
      resolve(payload.result as ExtractBrowserAutomationCommand<T>["result"]);
    };

    webview.addEventListener("ipc-message", handleMessage as any);
    const invokePayload: BrowserAutomationRequest<T> = {
      requestId,
      command,
      args: args as ExtractBrowserAutomationCommand<T>["args"],
    };
    webview.send("automation:invoke", invokePayload);
  });
}

export async function browserAutomate<
  T extends BrowserAutomationCommand["command"],
>(
  command: T,
  payload: ExtractBrowserAutomationCommand<T>["args"],
): Promise<ExtractBrowserAutomationCommand<T>["result"]> {
  const { paneId, ...rest } = payload;

  if (!paneId) {
    throw new Error("Browser pane ID is required.");
  }

  const webview = getWebview(paneId);

  return sendAutomationCommand(webview, command, rest);
}
