import type { ResolvedKeybinding } from "@/commands/keybindings/types";
import type { QuickPaneDescriptor } from "@/components/layout/quick/QuickPaneDialog";
import { getDefaultActions } from "@/commands/paneActions/core/defaults";
import type { Action } from "@/commands/paneActions/core/types";
import type { Notification, Tab } from "@/types";
import type { HyperTerminal } from "@shared/types";
import { createAtom, createFrozenAtom } from "@/store/createAtom";

export const tabsAtom = createFrozenAtom<Tab[]>([]);

export const activeTabIdAtom = createAtom(null as string | null);
export const activeTabAtom = createAtom<Tab | null>(() => {
  const tabs = tabsAtom.get();
  const activeTabId = activeTabIdAtom.get();
  return tabs.find((tab) => tab.id === activeTabId) ?? null;
});

export const activePaneIdAtom = createAtom<string | null>(() => {
  const activeTab = activeTabAtom.get();
  return activeTab?.activePaneId ?? null;
});

export const workspaceNameAtom = createAtom(null as string | null);
export const workspaceHasChangesAtom = createAtom<boolean>(false);
export const previousTabsSnapshotAtom = createAtom<string>("");

export const notificationsAtom = createAtom<Notification[]>([]);

export type ApplicationMode =
  "normal" | "design" | "quick" | "focus" | "overview";

export const applicationModeAtom = createAtom<ApplicationMode>("normal");

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
 * Quick pane atom - stores the current quick pane descriptor
 * Used to display the quick action dialog
 */
export const quickPaneAtom = createAtom(
  undefined as QuickPaneDescriptor | null | undefined,
);

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
