export type ThemeMode = "light" | "dark" | "system";

export type TabPosition = "top" | "bottom";

export type ThemeOverrides = {
  input?: string;
  border?: string;
  foreground?: string;
  selection?: string;
  accent?: string;
  background?: string;
  elevated?: string;
};

export type BrowserPage = {
  url: string;
  title: string;
};

export type AgentConfig = {
  id: string;
  name: string;
  command: string;
  interactiveCommand?: string;
  isDefault?: boolean;
};

export type LaunchGroup = {
  id: string;
  name: string;
  agentIds: string[];
  agentInstances?: {
    [agentId: string]: {
      count: number;
      instances?: {
        id: string;
        instructions?: string;
      }[];
    };
  };
};

export type PlayButtonTarget = "hyper" | "newPane";

export type TerminalLinkTarget = "pane" | "sidebar" | "default";

export type UserSettings = {
  // UI/Layout settings
  tabPosition: TabPosition;
  alwaysShowTabs: boolean;
  useGradientBorders: boolean;
  dimInactivePanes: boolean;
  alwaysHighlightActivePane: boolean;
  theme: ThemeMode;
  themeOverrides?: ThemeOverrides;

  // Terminal settings
  dotfilesRepo?: string;
  terminalShell?: string;
  terminalFontFamily?: string;
  terminalFontSize?: number;
  terminalLinkTarget?: TerminalLinkTarget;
  showTerminalRuler: boolean;
  showTabState: boolean;

  // Editor settings
  useConduitAsEditor: boolean;
  trackUnseenChangesInReviewMode: boolean; // Show unseen indicators for externally modified files in Review Mode

  // Workspace settings
  autoSaveWorkspaces: boolean;

  // Repository shortcuts
  showLaunchButton?: boolean;
  showPlayButton?: boolean;
  playButtonTarget?: PlayButtonTarget;

  // History/State
  urlHistory: string[];
  starredPages: BrowserPage[];
  homeDirectory: string | null;

  // Agent settings
  agents?: AgentConfig[];
  launchGroups?: LaunchGroup[];
  terminalPromptBufferLines?: number;
};

/**
 * Every setting that has a default. Main fills in whatever settings.json
 * leaves out from these, and the renderer starts from them until main replies.
 */
export const defaultSettings: Omit<UserSettings, "homeDirectory"> = {
  tabPosition: "bottom",
  alwaysShowTabs: true,
  useGradientBorders: false,
  dimInactivePanes: false,
  alwaysHighlightActivePane: false,
  theme: "dark",

  terminalFontFamily: '"Fira Code", Menlo, Monaco, "Courier New", monospace',
  terminalFontSize: 13,
  terminalLinkTarget: "pane",
  showTerminalRuler: false,
  showTabState: true,

  useConduitAsEditor: true,
  trackUnseenChangesInReviewMode: true,

  autoSaveWorkspaces: true,

  urlHistory: [],
  starredPages: [],

  agents: [],
  launchGroups: [],
  terminalPromptBufferLines: 100,
};

declare module "@shared/rpc" {
  interface Events {
    /** settings.json changed outside the app, for example by hand or a dotfiles pull. */
    settings: { changed: UserSettings };
  }
}
