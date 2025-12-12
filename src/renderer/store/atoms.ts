import type { ResolvedKeybinding } from "@/commands/keybindings/types";
import type { Action } from "@/commands/paneActions/core/types";
import type { Notification, Tab } from "@/types";
import type { UserSettings, WorkspaceState } from "@shared/types";
import { atom } from "jotai";
import { atomWithImmer } from "jotai-immer";

/**
 * Check if Editor v2 should be enabled via environment variable.
 * Usage: VITE_USE_EDITOR_V2=true npm start
 *
 * Note: This is the initial value for the atom. The main process settings.ts
 * also checks this env var and will override saved settings when the env var is set.
 * This ensures developers can easily switch between v1 and v2 for testing.
 */
const shouldUseEditorV2 = (): boolean => {
  const envValue = import.meta.env.VITE_USE_EDITOR_V2;
  if (envValue === "true" || envValue === "1") return true;
  if (envValue === "false" || envValue === "0") return false;
  return false; // Default to v1
};

export const userSettingsAtom = atom<UserSettings>({
  // UI/Layout settings
  tabPosition: "bottom",
  alwaysShowTabs: true,
  useGradientBorders: true,
  theme: "dark",

  // Terminal settings
  showTerminalRuler: true,

  // Editor settings
  useConduitAsEditor: true,
  useEditorV2: shouldUseEditorV2(), // Controlled by VITE_USE_EDITOR_V2 env var

  // Workspace settings
  autoSaveWorkspaces: true,

  // Agent settings
  agents: [],
  launchGroups: [],

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

export const hyperTerminalsAtom = atomWithImmer<
  Array<{
    terminalId: string;
    paneId: string;
    cwd: string | null;
  }>
>([]);
