import { normalizeUrl } from "@/utils/browser";
import type { HandlerMap } from "./types";
import {
  BROWSER_AUTOMATION_COMMANDS,
  type BrowserAutomationAction,
} from "@shared/cli/browser";

const automationHandlers = BROWSER_AUTOMATION_COMMANDS.reduce<
  Partial<HandlerMap>
>((handlers, command) => {
  handlers[command.name] = async (args, context) => {
    const result = await context.automateBrowser(
      command.automation,
      args as Parameters<
        typeof context.automateBrowser<BrowserAutomationAction>
      >[1],
    );

    if (command.respondWithResult) {
      return result;
    }
  };

  return handlers;
}, {});

export const browserHandlers: Partial<HandlerMap> = {
  ...automationHandlers,

  "browser-capture": async (args, context) => {
    const resolvedPane = context.resolveBrowserPane(args?.paneId);
    const webContentsId = resolvedPane.webview.getWebContentsId();

    context.deferResponse();

    await window.conduit.cli.completeCaptureBrowserRequest({
      requestId: context.requestId,
      webContentsId,
    });
  },

  "browser-navigate": (args, context) => {
    context.executeWebviewAction(args?.paneId, (webview) =>
      webview.loadURL(normalizeUrl(args.url)),
    );
  },

  "browser-back": (args, context) => {
    context.executeWebviewAction(args?.paneId, (webview) => webview.goBack());
  },

  "browser-forward": (args, context) => {
    context.executeWebviewAction(args?.paneId, (webview) =>
      webview.goForward(),
    );
  },

  "browser-refresh": (args, context) => {
    context.executeWebviewAction(args?.paneId, (webview) => webview.reload());
  },
};
