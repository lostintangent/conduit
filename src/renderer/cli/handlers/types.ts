import type { browserAutomate } from "@/cli/browser";
import type { QuickPaneDescriptor } from "@/components/layout/quick/QuickDialog";
import type { useCommand } from "@/commands/hooks/useCommand";
import type { Tab } from "@/types";
import type { CliCommand } from "@shared/cli/types";

export type ReturnTypeUseCommand = ReturnType<typeof useCommand>;

export type HandlerArgs<Name extends CliCommand["name"]> = Extract<
  CliCommand,
  { name: Name }
>["args"];

export type HandlerContext = {
  onOpenFile: (descriptor: QuickPaneDescriptor) => void;
  requestId: string;
  sessionId: string;
  activeTab?: Tab;
  tabs: Tab[];
  floatingTerminal?: { terminalId: string };
  respondResult: (result?: unknown) => void;
  respondError: (message: string) => void;
  findCallingTerminalTab: () => Tab | null;
  resolveTerminalSessions: (paneId?: string, all?: boolean) => string[] | null;
  resolveBrowserPane: (
    paneId?: string,
  ) => { paneId: string; webview: Electron.WebviewTag } | null;
  executeWebviewAction: (
    paneId: string | undefined,
    action: (webview: Electron.WebviewTag) => void,
  ) => void;
  automateBrowser: <T extends Parameters<typeof browserAutomate>[0]>(
    command: T,
    args: Parameters<typeof browserAutomate<T>>[1],
  ) => Promise<{ success: boolean; result?: unknown }>;
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
  args: HandlerArgs<Name>,
  context: HandlerContext,
) => Promise<void> | void;

export type HandlerMap = {
  [Name in CliCommand["name"]]: CliHandler<Name>;
};
