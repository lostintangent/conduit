import type {
  AutomationElementDescriptor,
  BrowserClickArgs,
  BrowserEvaluateArgs,
  BrowserKeysArgs,
  BrowserQueryArgs,
  BrowserQueryResult,
  BrowserScrollArgs,
  BrowserTypeArgs,
  BrowserWaitArgs,
} from "@shared/cli/automation";
import type { WebviewTag } from "electron";

function getWebview(paneId: string) {
  const webview = document.getElementById(paneId) as WebviewTag | null;
  if (!webview) {
    throw new Error(`Browser pane ${paneId} not found.`);
  }
  return webview;
}

type AutomationCommand =
  | { command: "query"; args: BrowserQueryArgs; result: BrowserQueryResult }
  | {
      command: "click";
      args: BrowserClickArgs;
      result: AutomationElementDescriptor;
    }
  | {
      command: "type";
      args: BrowserTypeArgs;
      result: AutomationElementDescriptor;
    }
  | { command: "keys"; args: BrowserKeysArgs; result: boolean }
  | { command: "scroll"; args: BrowserScrollArgs; result: boolean }
  | { command: "waitFor"; args: BrowserWaitArgs; result: boolean }
  | { command: "evaluate"; args: BrowserEvaluateArgs; result: unknown };

type ExtractCommand<T extends AutomationCommand["command"]> = Extract<
  AutomationCommand,
  { command: T }
>;

export async function browserAutomate<T extends AutomationCommand["command"]>(
  command: T,
  payload: ExtractCommand<T>["args"],
): Promise<ExtractCommand<T>["result"]> {
  const webview = getWebview(payload.paneId);
  const { paneId, ...rest } = payload;

  return webview.executeJavaScript<ExtractCommand<T>["result"]>(
    `window.__conduitAutomation.${command}(${JSON.stringify(rest ?? {})})`,
    true,
  );
}
