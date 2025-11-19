import type { ResolvedKeybinding } from "@/commands/keybindings/types";
import type { Action } from "@/commands/paneActions/core/types";
import type { Notification, Tab } from "@/types";
import type { UserSettings, WorkspaceState } from "@shared/types";
import { atom } from "jotai";
import { atomWithImmer } from "jotai-immer";

export const userSettingsAtom = atom<UserSettings>({
  // UI/Layout settings
  tabPosition: "bottom",
  alwaysShowTabs: true,
  useGradientBorders: true,
  theme: "dark",

  // Terminal settings
  showTerminalRuler: true,
  quickTerminalMode: "floating",

  // Editor settings
  useConduitAsEditor: true,

  // Workspace settings
  autoSaveWorkspaces: true,

  // History/State
  commandHistory: [],
  urlHistory: [],
  starredPages: [],
  homeDirectory: null,
});

export const tabsAtom = atomWithImmer<Tab[]>([]);

export const activeTabIdAtom = atom<string>();
export const activeTabAtom = atom<Tab | null>((get) => {
  const tabs = get(tabsAtom);
  const activeTabId = get(activeTabIdAtom);
  return tabs.find((tab) => tab.id === activeTabId) ?? null;
});

export const activePaneIdAtom = atom<string | null>((get) => {
  const activeTab = get(activeTabAtom);
  return activeTab?.activePaneId ?? null;
});

export const workspaceNameAtom = atom<string>();
export const workspaceStateAtom = atom<WorkspaceState>({ workspaces: [] });
export const workspaceHasChangesAtom = atom<boolean>(false);
export const previousTabsSnapshotAtom = atom<string>("");

export const notificationsAtom = atom<Notification[]>([]);

export type ApplicationMode =
  | "normal"
  | "design"
  | "quick"
  | "focus"
  | "overview";

export const applicationModeAtom = atom<ApplicationMode>("normal");

/**
 * Keybindings atom - stores all resolved keybindings grouped by command ID
 * Updated when keybindings are loaded or reloaded from user configuration
 */
export const keybindingsAtom = atom<Map<string, ResolvedKeybinding[]>>(
  new Map(),
);

/**
 * Pane actions atom - stores all pane actions (default or user-defined)
 * Updated when actions are loaded from file or changed programmatically
 */
export const paneActionsAtom = atom<Action[]>([]);

export type QuickTerminalState = {
  terminalId: string;
  paneId: string;
  cwd: string | null;
};

export const quickTerminalAtom = atom<QuickTerminalState | null>(null);
