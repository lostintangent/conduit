import {
  sidebarBrowserUrlAtom,
  sidebarPage,
} from "@features/browser/client/sidebar";
import { activeTabIdAtom, tabsAtom } from "@features/workbench/client/atoms";
import { sidebarStateAtom } from "@features/workbench/client/sidebarStore";
import type { Pane } from "@features/workbench/model";
import { runMutation } from "@/query";
import { workspaceMutations } from "./queries";

/** How long the tabs stay unchanged before they save. */
export const AUTOSAVE_DELAY_MS = 2000;

let started = false;
let paused = false;
let timer: ReturnType<typeof setTimeout> | undefined;
/** The tabs as last saved or opened, as `snapshot()` has them. */
let saved = "";
let switches: Promise<unknown> = Promise.resolve();

/**
 * Saves the window's tabs and sidebar page into the open workspace a moment
 * after they change. It starts once the tabs it's given are what launch opened, so
 * those don't save over the workspace they came from.
 */
export function startAutosave() {
  if (started) return;
  started = true;
  saved = snapshot();
  tabsAtom.subscribe(schedule);
  activeTabIdAtom.subscribe(schedule);
  sidebarBrowserUrlAtom.subscribe(schedule);
  sidebarStateAtom.subscribe(schedule);
}

/**
 * Saves now. Window close calls it, and a running command is only captured
 * when a save runs, so it saves even when no tab changed. Resolves false
 * when the save failed, which the save has already reported.
 */
export function flush(): Promise<boolean> {
  // After a switch, whose tabs could otherwise save into the wrong workspace
  return switches.then(save);
}

/**
 * Runs a change to which workspace is open, like opening another. The tabs
 * save into the workspace they belong to first, and the change's own tab
 * updates don't schedule saves. Changes run one at a time. One whose save
 * fails doesn't run, and resolves false.
 */
export function switching(change: () => Promise<void>): Promise<boolean> {
  const run = switches.then(async () => {
    if (!(await save())) return false;
    paused = true;
    try {
      await change();
    } finally {
      saved = snapshot();
      paused = false;
    }
    return true;
  });
  switches = run.catch(() => undefined);
  return run;
}

function schedule() {
  if (!started || paused) return;
  clearTimeout(timer);
  timer = undefined;
  if (snapshot() !== saved) {
    timer = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }
}

async function save(): Promise<boolean> {
  clearTimeout(timer);
  timer = undefined;
  if (tabsAtom.get().length === 0) return true;

  const saving = snapshot();
  try {
    await runMutation(workspaceMutations.save(), undefined);
  } catch {
    return false;
  }
  saved = saving;
  // The tabs may have changed while it saved
  schedule();
  return true;
}

/**
 * The tabs without what panes change on their own while they run, like a
 * terminal's title, so those don't save.
 */
function snapshot(): string {
  return JSON.stringify({
    sidebarPage: sidebarPage(),
    activeTabId: activeTabIdAtom.get(),
    tabs: tabsAtom.get().map((tab) => ({
      ...tab,
      panes: Object.values(tab.panes).map(withoutRuntimeFields),
    })),
  });
}

function withoutRuntimeFields(pane: Pane) {
  if (pane.type === "terminal") {
    const { title: _title, sessionId: _sessionId, ...saved } = pane;
    return saved;
  }
  if (pane.type === "browser") {
    const { title: _title, webContentsId: _webContentsId, ...saved } = pane;
    return saved;
  }
  return pane;
}
