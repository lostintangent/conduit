import { normalizeUrl } from "@features/browser/client/url";
import {
  BROWSER_AUTOMATION_COMMANDS,
  type BrowserAutomationAction,
  type BrowserAutomationCommandArgs,
  type BrowserAutomationCommandResult,
  type BrowserAutomationRequest,
  type BrowserAutomationResponse,
} from "@features/browser/model";
import {
  sidebarPaneIds,
  sidebarStateAtom,
} from "@features/workbench/client/sidebarStore";
import type { HandlerContext, HandlerMap } from "@/cli/handlers/types";
import type { WebviewTag } from "electron";

/**
 * Resolve a browser pane: the one asked for, else the sidebar's browser when
 * the sidebar shows it, else the first browser in the calling terminal's tab.
 */
function resolveBrowserPane(
  context: HandlerContext,
  paneId?: string,
): WebviewTag {
  const findBrowserPane = () => {
    // First, check if sidebar is open with browser view
    const sidebar = sidebarStateAtom.get();
    if (sidebar.isOpen && sidebar.view === "browser") {
      return sidebarPaneIds.browser();
    }

    // Fall back to checking for a browser pane in the tab
    const matchingTab = context.findCallingTerminalTab();

    const browserPane = Object.entries(matchingTab.panes).find(
      ([, pane]) => pane.type === "browser",
    );

    if (!browserPane) {
      throw new Error("No browser pane found in the calling tab.");
    }

    return browserPane[0];
  };

  const resolvedPaneId = paneId ?? findBrowserPane();

  const webview = document.getElementById(resolvedPaneId) as WebviewTag | null;

  if (!webview) {
    throw new Error(`Browser pane ${resolvedPaneId} not found.`);
  }

  return webview;
}

/** Runs an automation command in the page, through the webview's preload. */
function sendAutomationCommand<T extends BrowserAutomationAction>(
  webview: WebviewTag,
  name: T,
  args: Omit<BrowserAutomationCommandArgs<T>, "paneId">,
): Promise<BrowserAutomationCommandResult<T>> {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return new Promise((resolve, reject) => {
    const handleMessage = (
      event: Electron.IpcMessageEvent & { channel: string },
    ) => {
      if (event.channel !== "browser:response") return;
      const response = event.args?.[0] as
        BrowserAutomationResponse<T> | undefined;
      if (!response || response.requestId !== requestId) return;

      webview.removeEventListener("ipc-message", handleMessage as any);
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.result as BrowserAutomationCommandResult<T>);
    };

    webview.addEventListener("ipc-message", handleMessage as any);
    const request: BrowserAutomationRequest<T> = {
      requestId,
      name,
      args: args as BrowserAutomationCommandArgs<T>,
    };
    webview.send("browser:request", request);
  });
}

const automationHandlers = BROWSER_AUTOMATION_COMMANDS.reduce<
  Partial<HandlerMap>
>((handlers, command) => {
  handlers[command.name] = async (args, context) => {
    const { paneId, ...automationArgs } =
      args as BrowserAutomationCommandArgs<BrowserAutomationAction>;
    return sendAutomationCommand(
      resolveBrowserPane(context, paneId),
      command.automation,
      automationArgs,
    );
  };

  return handlers;
}, {});

export default {
  ...automationHandlers,

  "browser-capture": async (args, context) => {
    const webview = resolveBrowserPane(context, args?.paneId);

    context.suppressResponse();

    await window.conduit.cli.completeCaptureBrowserRequest({
      requestId: context.requestId,
      webContentsId: webview.getWebContentsId(),
    });
  },

  "browser-navigate": (args, context) => {
    const webview = resolveBrowserPane(context, args?.paneId);
    webview.loadURL(normalizeUrl(args.url));
  },

  "browser-back": (args, context) => {
    const webview = resolveBrowserPane(context, args?.paneId);
    webview.goBack();
  },

  "browser-forward": (args, context) => {
    const webview = resolveBrowserPane(context, args?.paneId);
    webview.goForward();
  },

  "browser-refresh": (args, context) => {
    const webview = resolveBrowserPane(context, args?.paneId);
    webview.reload();
  },
} satisfies Partial<HandlerMap>;
