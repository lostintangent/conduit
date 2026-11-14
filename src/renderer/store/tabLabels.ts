import {
  activeTabIdAtom,
  tabProgressAtom,
  tabsAtom,
  tabStateAtom,
  type TabProgressState,
  type TabState,
} from "@/store/atoms";
import type { Pane, Tab } from "@/types";
import { formatHomePath } from "@/utils/pathUtils";
import { createAtom } from "@/store/createAtom";
import { getSettings } from "@features/settings/client/queries";

export type TabDescriptor = {
  id: string;
  // Missing only for a tab without panes, which shouldn't exist.
  label: string | undefined;
  tooltip: Record<string, string>;
  name?: string;
  isActive: boolean;
  locked?: boolean;
  tabState: TabState;
  progressState: TabProgressState | null;
  progressPercent: number;
};

function resolveActivePane(tab: Tab): Pane | undefined {
  const activePane = tab.panes[tab.activePaneId];
  if (activePane) {
    return activePane;
  }

  const firstPane = Object.values(tab.panes)[0];
  return firstPane;
}

export const tabLabelsAtom = createAtom((): TabDescriptor[] => {
  const tabs = tabsAtom.get();
  const activeTabId = activeTabIdAtom.get();
  const tabStates = tabStateAtom.get();
  const tabProgress = tabProgressAtom.get();
  // Not tracked, since the home directory doesn't change while the app runs
  const { homeDirectory } = getSettings();

  const formatPathForLabel = (pathValue: string | null | undefined) =>
    pathValue ? formatHomePath(pathValue, homeDirectory) : null;

  return tabs.map((tab) => {
    const activePane = resolveActivePane(tab);

    let label: string | undefined;
    const tooltip: Record<string, string> = {};

    switch (activePane?.type) {
      case "terminal": {
        label =
          formatPathForLabel(activePane.cwd) ?? activePane.title ?? "Shell";

        if (activePane.cwd) {
          tooltip["CWD"] = activePane.cwd;
        }
        if (activePane.title) {
          tooltip["Command"] = activePane.title;
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
    const progress = tabProgress.get(tab.id);
    return {
      id: tab.id,
      label: name || label,
      name,
      tooltip,
      isActive,
      locked: tab.locked,
      tabState: tabStates.get(tab.id) ?? "idle",
      progressState: progress?.state ?? null,
      progressPercent: progress?.percent ?? 0,
    };
  });
});
