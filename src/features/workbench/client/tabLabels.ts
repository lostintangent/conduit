import {
  activeTabIdAtom,
  tabProgressAtom,
  tabsAtom,
  tabStateAtom,
  type TabProgressState,
  type TabState,
} from "@features/workbench/client/atoms";
import type { Pane, PaneIcon, PaneSound, Tab } from "@features/workbench/model";
import { isShellName } from "@features/terminal/model";
import { formatHomePath } from "@/utils/pathUtils";
import { createAtom } from "@/createAtom";
import { getSettings } from "@features/settings/client/queries";
import { shallow } from "@tanstack/react-store";

export type PaneLabel = {
  label: string;
  tooltip: Record<string, string>;
  icon?: PaneIcon;
  sound?: PaneSound;
};

/**
 * How a pane is labeled wherever it's shown, e.g. on its tab while it's the
 * tab's active pane, or on its bar while it's collapsed.
 */
export function describePane(pane: Pane, homeDirectory: string): PaneLabel {
  const formatPathForLabel = (pathValue: string | null | undefined) =>
    pathValue ? formatHomePath(pathValue, homeDirectory) : null;

  const tooltip: Record<string, string> = {};

  switch (pane.type) {
    case "terminal": {
      if (pane.cwd) {
        tooltip["CWD"] = pane.cwd;
      }
      if (pane.title) {
        tooltip["Command"] = pane.title;
      }

      // The shell titles its terminal with the command it's running, and
      // with its own name again at the prompt
      const command =
        pane.title && !isShellName(pane.title) ? pane.title : null;

      return {
        label: command ?? formatPathForLabel(pane.cwd) ?? pane.title ?? "Shell",
        tooltip,
      };
    }

    case "browser": {
      // A page titled with only whitespace has no title worth showing
      const title = pane.title?.trim() || undefined;
      if (title) {
        tooltip["Title"] = title;
      }
      tooltip["URL"] = pane.url;

      return {
        label: title ?? pane.url ?? "Browser",
        tooltip,
        icon: pane.icon,
        sound: paneSound(pane),
      };
    }

    case "editor": {
      const editorPath = pane.file ?? pane.cwd ?? null;

      tooltip["CWD"] = pane.cwd;
      if (pane.file) {
        tooltip["File"] = pane.file;
      }

      return {
        label: formatPathForLabel(editorPath) ?? editorPath ?? "Editor",
        tooltip,
      };
    }

    case "canvas": {
      return { label: "Canvas", tooltip };
    }
  }
}

export type TabDescriptor = {
  id: string;
  // Missing only for a tab without panes, which shouldn't exist.
  label: string | undefined;
  tooltip: Record<string, string>;
  name?: string;
  // A name is the user's own label, which shows without its pane's icon
  icon?: PaneIcon;
  sound?: PaneSound;
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

/** The sound a pane's page makes, which a muted page shows until it's unmuted */
function paneSound(pane: Pane): PaneSound | undefined {
  if (pane.type !== "browser") return;
  if (pane.muted) return "muted";
  if (pane.audible) return "playing";
}

/**
 * The sound a tab's pages make, whichever pane shows: playing while any page
 * that isn't muted plays, or else muted while the user has muted any.
 */
function tabSound(tab: Tab): PaneSound | undefined {
  const sounds = Object.values(tab.panes).map(paneSound);
  if (sounds.includes("playing")) return "playing";
  if (sounds.includes("muted")) return "muted";
}

function isSameDescriptor(
  { tooltip, ...descriptor }: TabDescriptor,
  { tooltip: otherTooltip, ...other }: TabDescriptor,
) {
  return shallow(descriptor, other) && shallow(tooltip, otherTooltip);
}

// Pane titles change constantly, so an unchanged tab keeps its descriptor,
// and the list stays the same when no tab changed. That way subscribers
// re-render only for the tabs whose labels changed.
export const tabLabelsAtom = createAtom((previous?: TabDescriptor[]) => {
  const tabs = tabsAtom.get();
  const activeTabId = activeTabIdAtom.get();
  const tabStates = tabStateAtom.get();
  const tabProgress = tabProgressAtom.get();
  // Not tracked, since the home directory doesn't change while the app runs
  const { homeDirectory } = getSettings();

  const descriptors = tabs.map((tab, index) => {
    const activePane = resolveActivePane(tab);
    const paneLabel = activePane && describePane(activePane, homeDirectory);

    const name = tab.name?.trim();
    const isActive = tab.id === activeTabId;
    const progress = tabProgress.get(tab.id);
    const descriptor: TabDescriptor = {
      id: tab.id,
      label: name || paneLabel?.label,
      name,
      icon: name ? undefined : paneLabel?.icon,
      sound: tabSound(tab),
      tooltip: paneLabel?.tooltip ?? {},
      isActive,
      locked: tab.locked,
      tabState: tabStates.get(tab.id) ?? "idle",
      progressState: progress?.state ?? null,
      progressPercent: progress?.percent ?? 0,
    };
    const previousDescriptor = previous?.[index];
    return previousDescriptor &&
      isSameDescriptor(previousDescriptor, descriptor)
      ? previousDescriptor
      : descriptor;
  });

  return previous && shallow(previous, descriptors) ? previous : descriptors;
});
