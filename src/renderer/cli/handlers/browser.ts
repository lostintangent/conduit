import { normalizeUrl } from "@/utils/browser";
import type { HandlerSubset } from "./types";
import {
  BROWSER_AUTOMATION_COMMANDS,
  type BrowserAutomationAction,
} from "@shared/cli/browser";

type AutomationCommandName =
  (typeof BROWSER_AUTOMATION_COMMANDS)[number]["name"];

const automationHandlers = BROWSER_AUTOMATION_COMMANDS.reduce<HandlerSubset>(
  (handlers, command) => {
    handlers[command.name] = async (args, context) => {
      const automationResult = await context.automateBrowser(
        command.automation,
        args as Parameters<
          typeof context.automateBrowser<BrowserAutomationAction>
        >[1],
      );

      if (!automationResult.success) {
        return;
      }

      if (command.respondWithResult) {
        context.respondResult(automationResult.result);
      } else {
        context.respondResult();
      }
    };

    return handlers;
  },
  {},
);

export const browserHandlers: HandlerSubset = {
  ...automationHandlers,

  "browser-capture": async (args, context) => {
    const resolvedPane = context.resolveBrowserPane(args?.paneId);

    if (!resolvedPane) {
      return;
    }

    const webContentsId = resolvedPane.webview.getWebContentsId();

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
