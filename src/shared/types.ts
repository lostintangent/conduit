export type TerminalPayload = {
  sessionId: string;
};

export type TerminalCreateResponse = TerminalPayload & {
  title: string;
  cwd: string;
};

export type TerminalCreateOptions = {
  cwd?: string;
};

export type TerminalDataPayload = TerminalPayload & {
  data: string;
};

export type TerminalTitlePayload = TerminalPayload & {
  title: string;
};

export type TerminalExitPayload = TerminalPayload & {
  exitCode: number | null;
  signal: number | null;
};

export type TerminalCwdPayload = TerminalPayload & {
  cwd: string;
};

export type TerminalResizePayload = TerminalPayload & {
  cols: number;
  rows: number;
};

export type TerminalInputPayload = TerminalPayload & {
  input: string;
};

export type AppPreferences = {
  tabPosition: "top" | "bottom";
  commandHistory: string[];
  alwaysShowTabStrip: boolean;
  showOverviewRuler: boolean;
  homeDirectory: string | null;
};

export type BackgroundCommandRequest = {
  command: string;
  args?: string[];
  cwd?: string | null;
};

export type SavedSession = {
  name: string;
  timestamp: number;
  tabs: Array<{
    id: string;
    title?: string;
    mode: "layout" | "focus";
    activePaneId: string;
    panes: Array<{
      id: string;
      type: "terminal" | "webview";
      cwd?: string | null;
      url?: string;
      webTitle?: string;
      // For terminal panes - the command that was running
      command?: string | null;
    }>;
    layout: unknown;
  }>;
  activeTabId?: string;
};
