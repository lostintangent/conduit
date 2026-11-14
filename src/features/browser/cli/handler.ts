import { normalizeUrl } from "@features/browser/client/url";
import type { HandlerMap } from "@/cli/handlers/types";
import {
  BROWSER_AUTOMATION_COMMANDS,
  type BrowserAutomationAction,
} from "@features/browser/model";

const automationHandlers = BROWSER_AUTOMATION_COMMANDS.reduce<
  Partial<HandlerMap>
>((handlers, command) => {
  handlers[command.name] = async (args, context) => {
    return context.automateBrowser(
      command.automation,
      args as Parameters<
        typeof context.automateBrowser<BrowserAutomationAction>
      >[1],
    );
  };

  return handlers;
}, {});

export const browserHandlers: Partial<HandlerMap> = {
  ...automationHandlers,

  "browser-capture": async (args, context) => {
    const { webview } = context.resolveBrowserPane(args?.paneId);

    context.suppressResponse();

    await window.conduit.cli.completeCaptureBrowserRequest({
      requestId: context.requestId,
      webContentsId: webview.getWebContentsId(),
    });
  },

  "browser-navigate": (args, context) => {
    const { webview } = context.resolveBrowserPane(args?.paneId);
    webview.loadURL(normalizeUrl(args.url));
  },

  "browser-back": (args, context) => {
    const { webview } = context.resolveBrowserPane(args?.paneId);
    webview.goBack();
  },

  "browser-forward": (args, context) => {
    const { webview } = context.resolveBrowserPane(args?.paneId);
    webview.goForward();
  },

  "browser-refresh": (args, context) => {
    const { webview } = context.resolveBrowserPane(args?.paneId);
    webview.reload();
  },
};
