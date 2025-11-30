import type {
  AutomationElementDescriptor,
  BrowserClickArgs,
  BrowserFocusArgs,
  BrowserHoverArgs,
  BrowserKeysArgs,
  BrowserQueryArgs,
  BrowserQueryResult,
  BrowserScrollArgs,
  BrowserTypeArgs,
  BrowserWaitArgs,
} from "@shared/cli/browser";
import type { WebviewTag } from "electron";

function getWebview(paneId: string) {
  const webview = document.getElementById(paneId) as WebviewTag | null;
  if (!webview) {
    throw new Error(`Browser pane ${paneId} not found.`);
  }
  return webview;
}

function sendAutomationCommand<T>(
  webview: WebviewTag,
  command: string,
  args: Record<string, unknown>,
): Promise<T> {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return new Promise<T>((resolve, reject) => {
    const handleMessage = (
      event: Electron.IpcMessageEvent & { channel: string },
    ) => {
      if (event.channel !== "automation:result") return;
      const payload = event.args?.[0];
      if (!payload || payload.id !== requestId) return;

      webview.removeEventListener("ipc-message", handleMessage as any);
      if (payload.error) {
        reject(new Error(payload.error));
        return;
      }
      resolve(payload.result as T);
    };

    webview.addEventListener("ipc-message", handleMessage as any);
    webview.send("automation:invoke", { id: requestId, command, args });
  });
}

type AutomationCommand =
  | { command: "query"; args: BrowserQueryArgs; result: BrowserQueryResult }
  | {
      command: "click";
      args: BrowserClickArgs;
      result: AutomationElementDescriptor;
    }
  | {
      command: "hover";
      args: BrowserHoverArgs;
      result: AutomationElementDescriptor;
    }
  | {
      command: "focus";
      args: BrowserFocusArgs;
      result: AutomationElementDescriptor;
    }
  | {
      command: "type";
      args: BrowserTypeArgs;
      result: AutomationElementDescriptor;
    }
  | { command: "keys"; args: BrowserKeysArgs; result: boolean }
  | { command: "scroll"; args: BrowserScrollArgs; result: boolean }
  | { command: "waitFor"; args: BrowserWaitArgs; result: boolean };

type ExtractCommand<T extends AutomationCommand["command"]> = Extract<
  AutomationCommand,
  { command: T }
>;

export async function browserAutomate<T extends AutomationCommand["command"]>(
  command: T,
  payload: ExtractCommand<T>["args"],
): Promise<ExtractCommand<T>["result"]> {
  const { paneId, ...rest } = payload;

  if (!paneId) {
    throw new Error("Browser pane ID is required.");
  }

  const webview = getWebview(paneId);

  return sendAutomationCommand<ExtractCommand<T>["result"]>(
    webview,
    command,
    rest,
  );
}
