import type { ResolvedKeybinding } from "@/commands/keybindings/types";
import { getDefaultActions } from "@features/workbench/client/paneActions/defaults";
import type { Action } from "@features/workbench/client/paneActions/types";
import type {
  HyperTerminal,
  Notification,
  Tab,
} from "@features/workbench/model";
import { createAtom, createFrozenAtom } from "@/createAtom";

export const tabsAtom = createFrozenAtom<Tab[]>([]);

/** The user's tabs, in the strip's order, without quick panes */
export const stripTabsAtom = createAtom<Tab[]>(() =>
  tabsAtom.get().filter((tab) => !tab.quick),
);

/** The open quick panes, the last one in front */
export const quickTabsAtom = createAtom<Tab[]>(() =>
  tabsAtom.get().filter((tab) => tab.quick),
);

/** The strip's selected tab */
export const activeTabIdAtom = createAtom(null as string | null);

/** The tab keys and commands act on: the front quick pane, or the strip's selection */
export const activeTabAtom = createAtom<Tab | null>(() => {
  const quick = quickTabsAtom.get().at(-1);
  if (quick) return quick;
  const tabs = tabsAtom.get();
  const activeTabId = activeTabIdAtom.get();
  return tabs.find((tab) => tab.id === activeTabId) ?? null;
});

export const activePaneIdAtom = createAtom<string | null>(() => {
  const activeTab = activeTabAtom.get();
  return activeTab?.activePaneId ?? null;
});

export const notificationsAtom = createAtom<Notification[]>([]);

export type ApplicationMode =
  "normal" | "design" | "quick" | "focus" | "overview";

const chosenModeAtom = createAtom<ApplicationMode>("normal");

/** The mode is "quick" while a quick pane is open, and the chosen mode otherwise */
export const applicationModeAtom = createAtom<ApplicationMode>(() =>
  quickTabsAtom.get().length > 0 ? "quick" : chosenModeAtom.get(),
);

/**
 * Chooses the mode. A quick pane keeps the strip out of reach, so the mode
 * can't change under one, and the chosen mode returns once it closes.
 */
export function setApplicationMode(mode: ApplicationMode) {
  if (quickTabsAtom.get().length > 0) return;
  chosenModeAtom.set(mode);
}

/**
 * Keybindings atom - stores all resolved keybindings grouped by command ID
 * Updated when keybindings are loaded or reloaded from user configuration
 */
export const keybindingsAtom = createAtom<Map<string, ResolvedKeybinding[]>>(
  new Map(),
);

/**
 * Pane actions atom - stores all pane actions (default or user-defined)
 * Updated when actions are loaded from file or changed programmatically
 */
export const paneActionsAtom = createAtom<Action[]>(getDefaultActions());

export const hyperTerminalsAtom = createFrozenAtom<HyperTerminal[]>([]);

/**
 * Tab terminal state for background tabs.
 * - "running": Terminal is actively receiving output
 * - "idle": Terminal has been idle (no output for 2+ seconds)
 * - "idle-unseen": Terminal is idle and user hasn't seen it yet
 * - "idle-notified": Terminal was explicitly notified via CLI command
 */
export type TabState = "running" | "idle" | "idle-unseen" | "idle-notified";

export const tabStateAtom = createFrozenAtom<Map<string, TabState>>(new Map());

/**
 * Tab progress state from OSC 9;4 escape sequences.
 * Used for agent activity indicators (thinking spinner, error state, etc.)
 */
export type TabProgressState =
  "hidden" | "default" | "error" | "indeterminate" | "warning";

export const tabProgressAtom = createFrozenAtom<
  Map<string, { state: TabProgressState; percent: number }>
>(new Map());
