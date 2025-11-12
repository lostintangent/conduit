import type { Tab, Pane } from "@/types";
import { atom } from "jotai";
import { activeTabIdAtom, tabsAtom, userSettingsAtom } from "@/store/atoms";

export type TabLabelDescriptor = {
  id: string;
  label: string;
  tooltip: string;
  isActive: boolean;
  title?: string;
  locked: boolean;
};

const resolveActivePane = (tab: Tab): Pane | undefined => {
  const activePane = tab.panes[tab.activePaneId];
  if (activePane) {
    return activePane;
  }

  const firstPane = Object.values(tab.panes)[0];
  return firstPane;
};

const normalizePath = (value: string | null | undefined) =>
  value ? value.replace(/\\/g, "/") : null;

export const tabLabelsAtom = atom((get): TabLabelDescriptor[] => {
  const tabs = get(tabsAtom);
  const activeTabId = get(activeTabIdAtom);
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
    let fallbackLabel = "Shell";
    let tooltipBase = "Shell";

    if (activePane?.type === "terminal") {
      fallbackLabel =
        formatPathForLabel(activePane.cwd) ??
        activePane.processTitle ??
        "Shell";

      tooltipBase = activePane.cwd ?? activePane.processTitle ?? fallbackLabel;
    } else if (activePane?.type === "webview") {
      const title = activePane.title?.trim();
      fallbackLabel =
        title && title.length > 0 ? title : (activePane.url ?? "Browser");
      tooltipBase = fallbackLabel;
    } else if (activePane?.type === "editor") {
      const editorPath = activePane.filePath ?? activePane.cwd ?? null;
      if (editorPath) {
        fallbackLabel = formatPathForLabel(editorPath) ?? editorPath;
        tooltipBase = editorPath;
      } else {
        fallbackLabel = "Editor";
        tooltipBase = fallbackLabel;
      }
    }

    const trimmedTitle = tab.title?.trim();
    const label =
      trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : fallbackLabel;
    const tooltip =
      trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : tooltipBase;

    return {
      id: tab.id,
      label,
      tooltip,
      isActive: tab.id === activeTabId,
      title: trimmedTitle || undefined,
      locked: tab.locked,
    };
  });
});
