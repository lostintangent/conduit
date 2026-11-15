import type { Tab } from "@features/workbench/model";
import type { WorkspaceState } from "../model";
import { waitFor } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { saveWorkspace } = vi.hoisted(() => {
  const saveWorkspace =
    vi.fn<(tabs: Tab[], activeTabId?: string) => Promise<WorkspaceState>>();
  (globalThis as any).window.conduit = { workspaces: { saveWorkspace } };
  return { saveWorkspace };
});

import { activeTabIdAtom, tabsAtom } from "@features/workbench/client/atoms";
import { sidebarBrowserUrlAtom } from "@features/browser/client/sidebar";
import { sidebarStateAtom } from "@features/workbench/client/sidebarStore";
import { AUTOSAVE_DELAY_MS, flush, startAutosave, switching } from "./autosave";

function tab(id: string, title = "zsh"): Tab {
  return {
    id,
    panes: {
      [`${id}-pane`]: {
        id: `${id}-pane`,
        type: "terminal",
        sessionId: `${id}-session`,
        cwd: "/repo",
        title,
      },
    },
    layout: { id: `${id}-node`, type: "pane", paneId: `${id}-pane` },
    activePaneId: `${id}-pane`,
  };
}

/** Lets the timer that's due run, then waits on real time for its save. */
function waitOutDelay() {
  vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
  vi.useRealTimers();
}

beforeAll(() => {
  tabsAtom.set([tab("one")]);
  activeTabIdAtom.set("one");
  startAutosave();
});

beforeEach(() => {
  saveWorkspace.mockReset();
  saveWorkspace.mockResolvedValue({ workspaces: [] });
});

afterEach(async () => {
  vi.useRealTimers();
  // Each test starts from saved tabs
  await flush();
});

describe("autosave", () => {
  it("saves the tabs into the open workspace once they've been still for 2 s", async () => {
    vi.useFakeTimers();
    tabsAtom.set([tab("one"), tab("two")]);
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS / 2);
    activeTabIdAtom.set("two");

    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 1);
    expect(saveWorkspace).not.toHaveBeenCalled();
    waitOutDelay();

    await waitFor(() => expect(saveWorkspace).toHaveBeenCalledTimes(1));
    expect(saveWorkspace).toHaveBeenCalledWith(
      [tab("one"), tab("two")],
      "two",
      undefined,
    );
  });

  it("doesn't save when only a terminal's title changed", () => {
    vi.useFakeTimers();
    const [, two] = tabsAtom.get();
    tabsAtom.set([tab("one", "npm test"), two]);

    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    expect(saveWorkspace).not.toHaveBeenCalled();
  });

  it("saves again when the tabs change while a save runs", async () => {
    let finishSave = () => {};
    saveWorkspace.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSave = () => resolve({ workspaces: [] });
        }),
    );
    tabsAtom.set([tab("one")]);
    const saving = flush();
    await waitFor(() => expect(saveWorkspace).toHaveBeenCalledTimes(1));

    vi.useFakeTimers();
    tabsAtom.set([tab("one"), tab("three")]);
    finishSave();
    await saving;
    waitOutDelay();

    await waitFor(() => expect(saveWorkspace).toHaveBeenCalledTimes(2));
    expect(saveWorkspace).toHaveBeenLastCalledWith(
      [tab("one"), tab("three")],
      "two",
      undefined,
    );
  });

  it("saves the tabs before a switch, and not the tabs the switch opens", async () => {
    vi.useFakeTimers();
    tabsAtom.set([tab("four")]);

    await switching(async () => {
      expect(saveWorkspace).toHaveBeenCalledWith(
        [tab("four")],
        "two",
        undefined,
      );
      tabsAtom.set([tab("five")]);
      activeTabIdAtom.set("five");
    });

    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    expect(saveWorkspace).toHaveBeenCalledTimes(1);
  });

  it("saves the sidebar's page as it moves on, and as the sidebar opens on it", async () => {
    vi.useFakeTimers();
    sidebarBrowserUrlAtom.set("https://a.com/");
    waitOutDelay();
    await waitFor(() => expect(saveWorkspace).toHaveBeenCalledTimes(1));
    expect(saveWorkspace).toHaveBeenLastCalledWith(expect.anything(), "five", {
      url: "https://a.com/",
      isOpen: false,
    });

    vi.useFakeTimers();
    sidebarStateAtom.set({ isOpen: true, view: "browser" });
    waitOutDelay();
    await waitFor(() => expect(saveWorkspace).toHaveBeenCalledTimes(2));
    expect(saveWorkspace).toHaveBeenLastCalledWith(expect.anything(), "five", {
      url: "https://a.com/",
      isOpen: true,
    });

    vi.useFakeTimers();
    sidebarStateAtom.set({
      isOpen: true,
      view: "browser",
      navigation: { cwd: "/repo" },
    });
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    expect(saveWorkspace).toHaveBeenCalledTimes(2);
  });

  it("doesn't switch when the tabs it would leave couldn't save", async () => {
    saveWorkspace.mockRejectedValueOnce(new Error("ENOSPC"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const change = vi.fn(async () => {});

    await expect(switching(change)).resolves.toBe(false);
    expect(change).not.toHaveBeenCalled();
  });
});
