export type ThemeMode = "light" | "dark" | "system";

export type TabPosition = "top" | "bottom";

export type ThemeOverrides = {
  input?: string;
  border?: string;
  foreground?: string;
  selection?: string;
  accent?: string;
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

// Legacy type alias for backwards compatibility
export type Team = LaunchGroup;

export type PlayButtonTarget = "hyper" | "newPane";

export type UserSettings = {
  // UI/Layout settings
  tabPosition: TabPosition;
  alwaysShowTabs: boolean;
  useGradientBorders: boolean;
  dimInactivePanes: boolean;
  theme: ThemeMode;
  themeOverrides?: ThemeOverrides;

  // Terminal settings
  showTerminalRuler: boolean;
  terminalPromptBufferLines?: number;
  terminalShell?: string;
  terminalFontFamily?: string;
  terminalFontSize?: number;
  agents?: AgentConfig[];
  launchGroups?: LaunchGroup[];

  // Editor settings
  useConduitAsEditor: boolean;
  useEditorV2: boolean; // Feature flag for the new Editor v2 implementation
  trackUnseenChangesInReviewMode: boolean; // Show unseen indicators for externally modified files in Review Mode

  // Workspace settings
  autoSaveWorkspaces: boolean;

  // Repository shortcuts
  showLaunchButton?: boolean;
  showPlayButton?: boolean;
  playButtonTarget?: PlayButtonTarget;

  // History/State
  commandHistory: string[];
  urlHistory: string[];
  starredPages: BrowserPage[];
  homeDirectory: string | null;
};
