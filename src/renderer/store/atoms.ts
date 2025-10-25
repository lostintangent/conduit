import type { Notification, Tab } from "@/types";
import type { UserSettings } from "@shared/types";
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

export const notificationsAtom = atom<Notification[]>([]);
