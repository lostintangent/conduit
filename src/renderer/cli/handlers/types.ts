import type { browserAutomate } from "@/cli/browser";
import type { useCommand } from "@/commands/hooks/useCommand";
import type { QuickPaneDescriptor } from "@/components/layout/quick/QuickDialog";
import type { Tab } from "@/types";
import type { CliCommand, CliCommandArgs } from "@shared/cli/types";

export type ReturnTypeUseCommand = ReturnType<typeof useCommand>;

export type HandlerContext = {
  onOpenFile: (descriptor: QuickPaneDescriptor) => void;
  requestId: string;
  sessionId: string;
  activeTab?: Tab;
  tabs: Tab[];
  hyperTerminal?: { terminalId: string };
  suppressResponse: () => void;
  findCallingTerminalTab: () => Tab;
  resolveTerminalSessions: (paneId?: string, all?: boolean) => string[];
  resolveBrowserPane: (paneId?: string) => {
    paneId: string;
    webview: Electron.WebviewTag;
  };
  executeWebviewAction: (
    paneId: string | undefined,
    action: (webview: Electron.WebviewTag) => void,
  ) => void;
  automateBrowser: <T extends Parameters<typeof browserAutomate>[0]>(
    command: T,
    args: Parameters<typeof browserAutomate<T>>[1],
  ) => Promise<unknown>;
  moveCommandMap: {
    left: ReturnTypeUseCommand;
    right: ReturnTypeUseCommand;
    up: ReturnTypeUseCommand;
    down: ReturnTypeUseCommand;
    tab: ReturnTypeUseCommand;
  };
  splitCommandMap: {
    terminal: Record<string, ReturnTypeUseCommand>;
    browser: Record<string, ReturnTypeUseCommand>;
    editor: Record<string, ReturnTypeUseCommand>;
  };
  focusPaneCommand: ReturnTypeUseCommand;
  closePaneCommand: ReturnTypeUseCommand;
  closeTabCommand: ReturnTypeUseCommand;
  duplicateTabCommand: ReturnTypeUseCommand;
};

export type CliHandler<Name extends CliCommand["name"]> = (
  args: CliCommandArgs<Name>,
  context: HandlerContext,
) => Promise<unknown> | unknown;

export type HandlerMap = {
  [Name in CliCommand["name"]]: CliHandler<Name>;
};
