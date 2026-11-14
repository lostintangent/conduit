import type { browserAutomate } from "@/cli/browser";
import type { QuickPaneDescriptor } from "@/components/layout/quick/QuickPaneDialog";
import type { Tab } from "@/types";
import type { CliCommand, CliCommandArgs } from "@shared/cli/types";

export type HandlerContext = {
  onOpenFile: (descriptor: QuickPaneDescriptor) => void;
  requestId: string;
  sessionId: string;
  activeTab?: Tab;
  tabs: Tab[];
  suppressResponse: () => void;
  findCallingTerminalTab: () => Tab;
  resolveTerminalSessions: (paneId?: string, all?: boolean) => string[];
  resolveBrowserPane: (paneId?: string) => {
    paneId: string;
    webview: Electron.WebviewTag;
  };
  resolveCanvasPane: (paneId?: string) => {
    paneId: string;
    canvas: HTMLCanvasElement;
  };
  automateBrowser: <T extends Parameters<typeof browserAutomate>[0]>(
    command: T,
    args: Parameters<typeof browserAutomate<T>>[1],
  ) => Promise<unknown>;
};

export type CliHandler<Name extends CliCommand["name"]> = (
  args: CliCommandArgs<Name>,
  context: HandlerContext,
) => Promise<unknown> | unknown;

export type HandlerMap = {
  [Name in CliCommand["name"]]: CliHandler<Name>;
};
