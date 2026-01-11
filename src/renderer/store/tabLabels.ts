import {
  activeTabIdAtom,
  tabsAtom,
  tabStateAtom,
  userSettingsAtom,
  type TabState,
} from "@/store/atoms";
import type { Pane, Tab } from "@/types";
import { atom } from "jotai";

export type TabDescriptor = {
  id: string;
  label: string;
  tooltip: Record<string, string>;
  name?: string;
  isActive: boolean;
  locked: boolean;
  tabState: TabState;
};

function resolveActivePane(tab: Tab): Pane | undefined {
  const activePane = tab.panes[tab.activePaneId];
  if (activePane) {
    return activePane;
  }

  const firstPane = Object.values(tab.panes)[0];
  return firstPane;
}

const normalizePath = (value: string | null | undefined) =>
  value ? value.replace(/\\/g, "/") : null;

export const tabLabelsAtom = atom((get): TabDescriptor[] => {
  const tabs = get(tabsAtom);
  const activeTabId = get(activeTabIdAtom);
  const tabStates = get(tabStateAtom);
  const { homeDirectory } = get(userSettingsAtom);

  const formatPathForLabel = (pathValue: string | null | undefined) => {
    if (!pathValue) {
      return null;
    }

    if (!homeDirectory) {
      return pathValue;
    }

    const normalizedPath = normalizePath(pathValue);
    const normalizedHome = normalizePath(homeDirectory);

    if (!normalizedPath || !normalizedHome) {
      return pathValue;
    }

    if (normalizedPath === normalizedHome) {
      return "~";
    }

    const homeWithSlash = normalizedHome.endsWith("/")
      ? normalizedHome
      : `${normalizedHome}/`;

    if (normalizedPath.startsWith(homeWithSlash)) {
      const suffix = normalizedPath.slice(homeWithSlash.length);
      return suffix ? `~/${suffix}` : "~";
    }

    return pathValue;
  };

  return tabs.map((tab) => {
    const activePane = resolveActivePane(tab);

    let label;
    const tooltip: Record<string, string> = {};

    switch (activePane?.type) {
      case "terminal": {
        label =
          formatPathForLabel(activePane.cwd) ??
          activePane.processTitle ??
          "Shell";

        tooltip["CWD"] = activePane.cwd;
        if (activePane.processTitle) {
          tooltip["Command"] = activePane.processTitle;
        }

        break;
      }

      case "browser": {
        const title = activePane.title?.trim();
        label = title ?? activePane.url ?? "Browser";

        if (activePane.title) {
          tooltip["Title"] = activePane.title;
        }
        tooltip["URL"] = activePane.url;

        break;
      }

      case "editor": {
        const editorPath = activePane.file ?? activePane.cwd ?? null;
        label = formatPathForLabel(editorPath) ?? editorPath ?? "Editor";

        tooltip["CWD"] = activePane.cwd;
        if (activePane.file) {
          tooltip["File"] = activePane.file;
        }

        break;
      }

      case "canvas": {
        label = "Canvas";
        break;
      }
    }

    const name = tab.name?.trim();
    const isActive = tab.id === activeTabId;
    return {
      id: tab.id,
      label: name || label,
      name,
      tooltip,
      isActive,
      locked: tab.locked,
      tabState: tabStates.get(tab.id) ?? "idle",
    };
  });
});
