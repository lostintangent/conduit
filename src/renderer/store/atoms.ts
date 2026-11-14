import type { ResolvedKeybinding } from "@/commands/keybindings/types";
import type { QuickPaneDescriptor } from "@/components/layout/quick/QuickPaneDialog";
import { getDefaultActions } from "@/commands/paneActions/core/defaults";
import type { Action } from "@/commands/paneActions/core/types";
import type { Notification, Tab } from "@/types";
import type {
  HyperTerminal,
  UserSettings,
  WorkspaceState,
} from "@shared/types";
import { atom } from "jotai";
import { atomWithImmer } from "jotai-immer";

export const userSettingsAtom = atom<UserSettings>({
  // UI/Layout settings
  tabPosition: "bottom",
  alwaysShowTabs: true,
  alwaysHighlightActivePane: false,
  useGradientBorders: false,
  dimInactivePanes: false,
  theme: "dark",

  // Terminal settings
  showTerminalRuler: false,
  showTabState: true,

  // Editor settings
  useConduitAsEditor: true,
  trackUnseenChangesInReviewMode: true,

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
  "normal" | "design" | "quick" | "focus" | "overview";

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
export const paneActionsAtom = atom<Action[]>(getDefaultActions());

export const hyperTerminalsAtom = atomWithImmer<HyperTerminal[]>([]);

/**
 * Quick pane atom - stores the current quick pane descriptor
 * Used to display the quick action dialog
 */
export const quickPaneAtom = atom<QuickPaneDescriptor | null>();

/**
 * Tab terminal state for background tabs.
 * - "running": Terminal is actively receiving output
 * - "idle": Terminal has been idle (no output for 2+ seconds)
 * - "idle-unseen": Terminal is idle and user hasn't seen it yet
 * - "idle-notified": Terminal was explicitly notified via CLI command
 */
export type TabState = "running" | "idle" | "idle-unseen" | "idle-notified";

export const tabStateAtom = atomWithImmer<Map<string, TabState>>(new Map());

/**
 * Tab progress state from OSC 9;4 escape sequences.
 * Used for agent activity indicators (thinking spinner, error state, etc.)
 */
export type TabProgressState =
  "hidden" | "default" | "error" | "indeterminate" | "warning";

export const tabProgressAtom = atomWithImmer<
  Map<string, { state: TabProgressState; percent: number }>
>(new Map());
