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

export type UserSettings = {
  // UI/Layout settings
  tabPosition: TabPosition;
  alwaysShowTabs: boolean;
  useGradientBorders: boolean;
  theme: ThemeMode;
  themeOverrides?: ThemeOverrides;

  // Terminal settings
  showTerminalRuler: boolean;
  terminalPromptAgent?: string; // Deprecated: kept for backward compatibility
  terminalPromptBufferLines?: number;
  agents?: AgentConfig[];
  terminalFontFamily?: string;
  terminalFontSize?: number;

  // Editor settings
  useConduitAsEditor: boolean;
  useEditorV2: boolean; // Feature flag for the new Editor v2 implementation

  // Workspace settings
  autoSaveWorkspaces: boolean;

  // History/State
  commandHistory: string[];
  urlHistory: string[];
  starredPages: BrowserPage[];
  homeDirectory: string | null;
};
