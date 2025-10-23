import { atom } from "jotai";
import type { Tab } from "@/types";
import type { AppPreferences } from "@shared/types";

export const tabsAtom = atom<Tab[]>([]);

export const appPreferencesAtom = atom<AppPreferences>({
  tabPosition: "bottom",
  commandHistory: [],
  alwaysShowTabStrip: true,
  showOverviewRuler: true,
  homeDirectory: null,
});
