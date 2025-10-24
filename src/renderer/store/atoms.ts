import type { Tab } from "@/types";
import type { AppPreferences } from "@shared/types";
import { atom } from "jotai";

export const tabsAtom = atom<Tab[]>([]);

export const activeTabIdAtom = atom<string>();

export const activeTabAtom = atom<Tab | null>((get) => {
  const tabs = get(tabsAtom);
  const activeTabId = get(activeTabIdAtom);
  return tabs.find((tab) => tab.id === activeTabId) ?? null;
});

export const appPreferencesAtom = atom<AppPreferences>({
  tabPosition: "bottom",
  commandHistory: [],
  alwaysShowTabStrip: true,
  showOverviewRuler: true,
  homeDirectory: null,
});
