import type { Notification, Tab } from "@/types";
import type { UserSettings, Workspace } from "@shared/types";
import { atom } from "jotai";

export const userSettingsAtom = atom<UserSettings>({
  tabPosition: "bottom",
  alwaysShowTabs: true,
  showTerminalRuler: true,
  commandHistory: [],
  homeDirectory: null,
});

export const tabsAtom = atom<Tab[]>([]);

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
export const workspacesAtom = atom<Workspace[]>([]);
export const workspaceHasChangesAtom = atom<boolean>(false);

export const notificationsAtom = atom<Notification[]>([]);

export const isInDesignModeAtom = atom<boolean>(false);