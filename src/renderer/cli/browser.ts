import type {
  BrowserAutomationArgs,
  BrowserAutomationCommand,
  BrowserAutomationRequest,
  BrowserAutomationResponse,
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
  args: Omit<BrowserAutomationArgs<T>["args"], "paneId">,
): Promise<BrowserAutomationArgs<T>["result"]> {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return new Promise((resolve, reject) => {
    const handleMessage = (
      event: Electron.IpcMessageEvent & { channel: string },
    ) => {
      if (event.channel !== "browser:response") return;
      const response = event.args?.[0] as
        | BrowserAutomationResponse<T>
        | undefined;
      if (!response || response.requestId !== requestId) return;

      webview.removeEventListener("ipc-message", handleMessage as any);
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.result as BrowserAutomationArgs<T>["result"]);
    };

    webview.addEventListener("ipc-message", handleMessage as any);
    const request: BrowserAutomationRequest<T> = {
      requestId,
      command,
      args: args as BrowserAutomationArgs<T>["args"],
    };
    webview.send("browser:request", request);
  });
}

export async function browserAutomate<
  T extends BrowserAutomationCommand["command"],
>(
  command: T,
  request: BrowserAutomationArgs<T>["args"],
): Promise<BrowserAutomationArgs<T>["result"]> {
  const { paneId, ...rest } = request;

  if (!paneId) {
    throw new Error("Browser pane ID is required.");
  }

  const webview = getWebview(paneId);

  return sendAutomationCommand(webview, command, rest);
}
