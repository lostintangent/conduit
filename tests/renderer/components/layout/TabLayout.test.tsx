import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openExternal = vi.hoisted(() => {
  const openExternal = vi.fn();
  (window as any).conduit = { openExternal };
  return openExternal;
});

let terminalProps: { onLinkClick: (url: string) => void } | undefined;
// Panes whose terminal throws while it renders
const crashingPanes = new Set<string>();
// The tab of each terminal pane that mounted, recorded when its state is
// created, so a remount shows up as a repeat.
const terminalMounts: string[] = [];
// The tab of each terminal pane render
const terminalRenders: string[] = [];
vi.mock("@features/terminal/components/TerminalPane", async () => {
  const { useState } = await import("react");
  return {
    TerminalPane: (props: {
      tabId: string;
      pane: { id: string };
      onLinkClick: (url: string) => void;
    }) => {
      if (crashingPanes.has(props.pane.id)) {
        throw new Error("Terminal broke");
      }
      terminalProps = props;
      terminalRenders.push(props.tabId);
      useState(() => terminalMounts.push(props.tabId));
      return (
        <div
          data-testid={`terminal-${props.tabId}`}
          data-pane={props.pane.id}
        />
      );
    },
  };
});

import { TabContentPortalProvider } from "@/components/layout/normal/TabContentPortalContext";
import { TabLayout } from "@/components/layout/normal/TabLayout";
import { TabPreviewItem } from "@/components/layout/overview/TabPreviewItem";
import { createQueryClient } from "@/query";
import { activeTabIdAtom, applicationModeAtom, tabsAtom } from "@/store/atoms";
import { sidebarStateAtom } from "@/store/sidebarStore";
import type { Tab } from "@/types";
import type { QueryClient } from "@tanstack/react-query";
import { enableMapSet } from "immer";
import { render, seedSettings } from "../../queryRender";

enableMapSet();

const tab: Tab = {
  id: "tab-1",
  name: "Tab",
  panes: {
    term: {
      id: "term",
      type: "terminal",
      sessionId: "session-1",
      cwd: "/repo",
      title: "zsh",
    },
  },
  layout: { id: "node-term", type: "pane", paneId: "term" },
  activePaneId: "term",
};

let queryClient: QueryClient;
beforeEach(() => {
  queryClient = createQueryClient();
});

function tabLayout(preview?: React.ReactNode) {
  return (
    <TabContentPortalProvider>
      <TabLayout
        handleContextMenu={vi.fn()}
        handleResizeStart={vi.fn()}
        resizingNode={null}
        handleBrowserUpdate={vi.fn()}
        handleEditorUpdate={vi.fn()}
      />
      {preview}
    </TabContentPortalProvider>
  );
}

function renderTabLayout() {
  return render(tabLayout(), { queryClient });
}

describe("TabLayout terminal links", () => {
  beforeEach(() => {
    terminalProps = undefined;
    openExternal.mockClear();
    tabsAtom.set([tab]);
    activeTabIdAtom.set("tab-1");
  });

  it("opens links in the default browser when that's the link target", () => {
    seedSettings(queryClient, { terminalLinkTarget: "default" });
    renderTabLayout();

    act(() => terminalProps!.onLinkClick("https://example.com"));

    expect(openExternal).toHaveBeenCalledWith("https://example.com");
    expect(tabsAtom.get()[0].panes).toEqual(tab.panes);
  });

  it("follows a link target change made while the terminal is open", async () => {
    seedSettings(queryClient, { terminalLinkTarget: "default" });
    renderTabLayout();
    const { onLinkClick } = terminalProps!;

    act(() => {
      seedSettings(queryClient, { terminalLinkTarget: "sidebar" });
    });
    await waitFor(() =>
      expect(terminalProps!.onLinkClick).not.toBe(onLinkClick),
    );
    act(() => terminalProps!.onLinkClick("https://example.com"));

    expect(openExternal).not.toHaveBeenCalled();
    expect(sidebarStateAtom.get()).toMatchObject({
      isOpen: true,
      view: "browser",
      navigation: { cwd: "/repo", browserUrl: "https://example.com" },
    });
  });
});

describe("TabLayout pane controls", () => {
  afterEach(() => applicationModeAtom.set("normal"));

  it("hides the close button once the last other tab closes", () => {
    tabsAtom.set([tab, { ...tab, id: "tab-2" }]);
    activeTabIdAtom.set("tab-1");
    applicationModeAtom.set("design");
    renderTabLayout();

    expect(screen.queryByTitle("Close pane (Alt+W)")).not.toBeNull();

    act(() => tabsAtom.set([tab]));

    expect(screen.queryByTitle("Close pane (Alt+W)")).toBeNull();
  });
});

describe("TabLayout tab switching", () => {
  it("keeps each tab's panes mounted while other tabs show", () => {
    tabsAtom.set([tab, { ...tab, id: "tab-2" }]);
    activeTabIdAtom.set("tab-1");
    terminalMounts.length = 0;
    renderTabLayout();

    act(() => activeTabIdAtom.set("tab-2"));
    act(() => activeTabIdAtom.set("tab-1"));
    act(() => activeTabIdAtom.set("tab-2"));

    expect(terminalMounts.sort()).toEqual(["tab-1", "tab-2"]);
  });

  it("re-renders only the tab whose terminal retitles itself", () => {
    tabsAtom.set([tab, { ...tab, id: "tab-2" }]);
    activeTabIdAtom.set("tab-1");
    renderTabLayout();
    terminalRenders.length = 0;

    act(() =>
      tabsAtom.set(
        tabsAtom.get().map((candidate) =>
          candidate.id === "tab-2"
            ? {
                ...candidate,
                panes: { term: { ...tab.panes.term, title: "vim" } },
              }
            : candidate,
        ),
      ),
    );

    expect(terminalRenders).toContain("tab-2");
    expect(terminalRenders).not.toContain("tab-1");
  });

  it("shows a tab's panes in its preview without remounting them", () => {
    tabsAtom.set([tab, { ...tab, id: "tab-2" }]);
    activeTabIdAtom.set("tab-1");
    terminalMounts.length = 0;
    const { rerender } = renderTabLayout();
    const preview = <TabPreviewItem tabId="tab-2" />;
    const panelOf = (tabId: string) =>
      screen.getByTestId(`terminal-${tabId}`).closest('[role="tabpanel"]');

    rerender(tabLayout(preview));
    expect(panelOf("tab-2")).toBeNull();

    rerender(tabLayout());
    rerender(tabLayout(preview));
    rerender(tabLayout());

    expect(panelOf("tab-2")).not.toBeNull();
    expect(terminalMounts.sort()).toEqual(["tab-1", "tab-2"]);
  });

  it("flashes a tab's active pane each time the tab shows", async () => {
    const splitTab = (id: string, paneIds: string[]): Tab => ({
      id,
      name: "Tab",
      panes: Object.fromEntries(
        paneIds.map((paneId) => [paneId, { ...tab.panes.term, id: paneId }]),
      ),
      layout: {
        id: `row-${id}`,
        type: "split",
        direction: "row",
        children: paneIds.map((paneId) => ({
          id: `node-${paneId}`,
          type: "pane",
          paneId,
        })),
      },
      activePaneId: paneIds[0],
    });
    tabsAtom.set([
      splitTab("tab-1", ["a1", "a2"]),
      splitTab("tab-2", ["b1", "b2"]),
    ]);
    activeTabIdAtom.set("tab-1");
    const { container } = renderTabLayout();
    const highlightedPanes = () =>
      [...container.querySelectorAll('[class*="pane-highlight"]')].map(
        (highlight) =>
          highlight.parentElement!.querySelector<HTMLElement>("[data-pane]")!
            .dataset.pane,
      );
    const nextFrame = () =>
      act(() => new Promise((resolve) => requestAnimationFrame(resolve)));

    await nextFrame();
    expect(highlightedPanes()).toEqual(["a1"]);

    act(() => activeTabIdAtom.set("tab-2"));
    await nextFrame();
    expect(highlightedPanes()).toEqual(["b1"]);

    act(() => activeTabIdAtom.set("tab-1"));
    expect(highlightedPanes()).toEqual([]);
    await nextFrame();
    expect(highlightedPanes()).toEqual(["a1"]);
  });
});

describe("TabLayout pane errors", () => {
  const splitTab: Tab = {
    ...tab,
    panes: {
      left: { ...tab.panes.term, id: "left" },
      right: { ...tab.panes.term, id: "right" },
    },
    layout: {
      id: "row",
      type: "split",
      direction: "row",
      children: [
        { id: "node-left", type: "pane", paneId: "left" },
        { id: "node-right", type: "pane", paneId: "right" },
      ],
    },
    activePaneId: "left",
  };
  const terminalPanes = () =>
    [...document.querySelectorAll<HTMLElement>("[data-pane]")].map(
      (terminal) => terminal.dataset.pane,
    );

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    tabsAtom.set([splitTab]);
    activeTabIdAtom.set("tab-1");
  });
  afterEach(() => {
    crashingPanes.clear();
    vi.restoreAllMocks();
  });

  it("shows a pane that throws as crashed, and keeps the panes beside it", () => {
    crashingPanes.add("right");
    renderTabLayout();

    expect(terminalPanes()).toEqual(["left"]);
    expect(screen.getByText("This pane crashed")).not.toBeNull();
    expect(screen.getByText("Terminal broke")).not.toBeNull();
  });

  it("shows the pane again on Retry", () => {
    crashingPanes.add("right");
    renderTabLayout();

    crashingPanes.clear();
    fireEvent.click(screen.getByText("Retry"));

    expect(terminalPanes()).toEqual(["left", "right"]);
  });

  it("closes the crashed pane", () => {
    crashingPanes.add("right");
    renderTabLayout();

    fireEvent.click(screen.getByText("Close"));

    expect(Object.keys(tabsAtom.get()[0].panes)).toEqual(["left"]);
    expect(terminalPanes()).toEqual(["left"]);
  });
});
