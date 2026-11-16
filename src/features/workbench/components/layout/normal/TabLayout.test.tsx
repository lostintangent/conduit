import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openExternal = vi.hoisted(() => {
  const openExternal = vi.fn();
  (window as any).conduit = { workbench: { openExternal } };
  return openExternal;
});

let terminalProps:
  { onLinkClick: (url: string, newPane?: boolean) => void } | undefined;
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
      onLinkClick: (url: string, newPane?: boolean) => void;
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

// A browser pane's page is put up by the tests that need one
vi.mock("@features/browser/components/BrowserPane", () => ({
  BrowserPane: () => null,
}));

import { TabContentPortalProvider } from "@features/workbench/components/layout/normal/TabContentPortalContext";
import { TabLayout } from "@features/workbench/components/layout/normal/TabLayout";
import { getLayoutPane } from "@features/workbench/components/layout/paneKinds";
import { TabPreviewItem } from "@features/workbench/components/layout/overview/TabPreviewItem";
import { createQueryClient } from "@/query";
import {
  activeTabIdAtom,
  setApplicationMode,
  tabsAtom,
} from "@features/workbench/client/atoms";
import { sidebarStateAtom } from "@features/workbench/client/sidebarStore";
import { sidebarBrowserUrlAtom } from "@features/browser/client/sidebar";
import type {
  Pane,
  SplitDirection,
  Tab,
  TerminalPane,
} from "@features/workbench/model";
import { TooltipProvider } from "@/ui/tooltip";
import { PANE_SPLIT_TYPES } from "@shared/cli/types";
import type { QueryClient } from "@tanstack/react-query";
import { enableMapSet } from "immer";
import {
  render,
  seedSettings,
} from "../../../../../../tests/renderer/queryRender";

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
    <TooltipProvider>
      <TabContentPortalProvider>
        <TabLayout
          handleContextMenu={vi.fn()}
          handleResizeStart={vi.fn()}
          resizingNode={null}
        />
        {preview}
      </TabContentPortalProvider>
    </TooltipProvider>
  );
}

function renderTabLayout() {
  return render(tabLayout(), { queryClient });
}

it("finds a pane for every kind in its feature's panes.tsx", () => {
  expect(PANE_SPLIT_TYPES.filter((type) => !getLayoutPane(type))).toEqual([]);
});

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

  it("activates the terminal whose link was followed, as a click in it would", () => {
    seedSettings(queryClient, { terminalLinkTarget: "default" });
    tabsAtom.set([
      {
        ...tab,
        panes: {
          ...tab.panes,
          page: { id: "page", type: "browser", url: "https://page.com" },
        },
        layout: {
          id: "split",
          type: "split",
          direction: "row",
          children: [
            tab.layout,
            { id: "node-page", type: "pane", paneId: "page" },
          ],
        },
        activePaneId: "page",
      },
    ]);
    renderTabLayout();

    act(() => terminalProps!.onLinkClick("https://example.com"));

    expect(tabsAtom.get()[0].activePaneId).toBe("term");
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
    });
    expect(sidebarBrowserUrlAtom.get()).toBe("https://example.com");
  });

  it("loads a link into the sidebar's page when that page is already up", () => {
    // The sidebar's webview stays on the body after the sidebar closes
    const webview = Object.assign(document.createElement("div"), {
      id: "sidebar-browser",
      src: "https://before.com",
    });
    document.body.append(webview);
    seedSettings(queryClient, { terminalLinkTarget: "sidebar" });
    renderTabLayout();

    act(() => terminalProps!.onLinkClick("https://example.com"));

    expect(webview.src).toBe("https://example.com");
    webview.remove();
  });

  describe("in a browser pane", () => {
    const browserPanes = () =>
      Object.values(tabsAtom.get()[0].panes).filter(
        (pane) => pane.type === "browser",
      );
    const linkPane = () =>
      (tabsAtom.get()[0].panes.term as TerminalPane).linkPane;
    /** Puts up the webview a browser pane would have for its page */
    const showPage = (paneId: string) => {
      const webview = Object.assign(document.createElement("div"), {
        id: paneId,
        src: "https://before.com",
      });
      document.body.append(webview);
      return webview;
    };
    afterEach(() => {
      for (const pane of browserPanes())
        document.getElementById(pane.id)?.remove();
    });

    it("opens one next to the terminal, which keeps the keys", () => {
      seedSettings(queryClient, { terminalLinkTarget: "pane" });
      renderTabLayout();

      act(() => terminalProps!.onLinkClick("https://example.com", false));

      expect(browserPanes()).toEqual([
        expect.objectContaining({ url: "https://example.com" }),
      ]);
      expect(tabsAtom.get()[0].activePaneId).toBe("term");
      expect(linkPane()).toBe(browserPanes()[0].id);
    });

    it("loads later links in the pane the terminal last opened", () => {
      seedSettings(queryClient, { terminalLinkTarget: "pane" });
      renderTabLayout();
      act(() => terminalProps!.onLinkClick("https://example.com", false));
      const webview = showPage(linkPane()!);

      act(() => terminalProps!.onLinkClick("https://example.com/two", false));

      expect(browserPanes()).toHaveLength(1);
      expect(webview.src).toBe("https://example.com/two");
    });

    it("opens a new one on Cmd-Shift-click, whatever the link target", () => {
      seedSettings(queryClient, { terminalLinkTarget: "default" });
      renderTabLayout();

      act(() => terminalProps!.onLinkClick("https://example.com", true));
      showPage(linkPane()!);
      act(() => terminalProps!.onLinkClick("https://example.com/two", true));

      expect(browserPanes()).toEqual([
        expect.objectContaining({ url: "https://example.com" }),
        expect.objectContaining({ url: "https://example.com/two" }),
      ]);
      expect(openExternal).not.toHaveBeenCalled();
      expect(tabsAtom.get()[0].activePaneId).toBe("term");
    });

    it("loads later links in the one Cmd-Shift-click opened", () => {
      seedSettings(queryClient, { terminalLinkTarget: "pane" });
      renderTabLayout();
      act(() => terminalProps!.onLinkClick("https://example.com", false));
      const first = showPage(linkPane()!);
      act(() => terminalProps!.onLinkClick("https://example.com/two", true));
      const second = showPage(linkPane()!);

      act(() => terminalProps!.onLinkClick("https://example.com/three", false));

      expect(browserPanes()).toHaveLength(2);
      expect(first.src).toBe("https://before.com");
      expect(second.src).toBe("https://example.com/three");
    });

    it("opens a new one once the pane it opened has closed", () => {
      seedSettings(queryClient, { terminalLinkTarget: "pane" });
      const term = { ...(tab.panes.term as TerminalPane), linkPane: "gone" };
      tabsAtom.set([{ ...tab, panes: { term } }]);
      // Its webview is still up, as it is while a closed pane is cleaned up
      const stale = showPage("gone");
      renderTabLayout();

      act(() => terminalProps!.onLinkClick("https://example.com", false));

      expect(stale.src).toBe("https://before.com");
      expect(browserPanes()).toEqual([
        expect.objectContaining({ url: "https://example.com" }),
      ]);
      stale.remove();
    });
  });
});

describe("TabLayout pane controls", () => {
  afterEach(() => setApplicationMode("normal"));

  it("hides the close button once the last other tab closes", () => {
    tabsAtom.set([tab, { ...tab, id: "tab-2" }]);
    activeTabIdAtom.set("tab-1");
    setApplicationMode("design");
    renderTabLayout();

    expect(screen.queryByTitle("Close pane (Alt+W)")).not.toBeNull();

    act(() => tabsAtom.set([tab]));

    expect(screen.queryByTitle("Close pane (Alt+W)")).toBeNull();
  });
});

describe("TabLayout tab switching", () => {
  afterEach(() => vi.unstubAllGlobals());

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

  it("lays a tab out in its preview at the size of its panel, scaled down", () => {
    let resized: (sizes: [width: number, height: number][]) => void;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resized = (sizes) =>
            callback(
              sizes.map(([width, height]) => ({
                contentRect: { width, height },
              })) as ResizeObserverEntry[],
              this as unknown as ResizeObserver,
            );
        }
        observe() {}
        unobserve() {}
      },
    );
    tabsAtom.set([tab, { ...tab, id: "tab-2" }]);
    activeTabIdAtom.set("tab-1");
    const { container } = render(tabLayout(<TabPreviewItem tabId="tab-2" />), {
      queryClient,
    });

    // The active tab's panel, then the hidden one's
    act(() =>
      resized([
        [1600, 900],
        [0, 0],
      ]),
    );

    const preview = container.lastElementChild as HTMLElement;
    const content = preview.firstElementChild!.firstElementChild as HTMLElement;
    expect([content.style.width, content.style.height]).toEqual([
      "1600px",
      "900px",
    ]);
    expect([preview.style.width, preview.style.height]).toEqual([
      "320px",
      "180px",
    ]);
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

  it("takes focus out of a tab as soon as another tab shows", () => {
    tabsAtom.set([tab, { ...tab, id: "tab-2" }]);
    activeTabIdAtom.set("tab-1");
    renderTabLayout();
    const terminal = screen.getByTestId("terminal-tab-1");
    terminal.tabIndex = -1;
    terminal.focus();

    act(() => activeTabIdAtom.set("tab-2"));

    // Keys typed before tab 2's pane takes focus would go to tab 1's shell
    expect(document.activeElement).toBe(document.body);
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

describe("TabLayout collapsed panes", () => {
  const collapsedPane = (cwd: string, title = "zsh"): Pane => ({
    id: "collapsed",
    type: "terminal",
    sessionId: "session-2",
    cwd,
    title,
  });
  const collapsedTab = (
    direction: SplitDirection,
    collapsed = collapsedPane("/Users/tester/proj"),
  ): Tab => ({
    ...tab,
    panes: {
      open: { ...tab.panes.term, id: "open" },
      collapsed,
    },
    layout: {
      id: "split",
      type: "split",
      direction,
      children: [
        { id: "node-open", type: "pane", paneId: "open" },
        {
          id: "node-collapsed",
          type: "pane",
          paneId: "collapsed",
          collapsed: true,
        },
      ],
    },
    activePaneId: "open",
  });

  it.each(["row", "column"] as const)(
    "labels a collapsed pane in a %s split the way its tab would, as it changes",
    async (direction) => {
      tabsAtom.set([collapsedTab(direction)]);
      activeTabIdAtom.set("tab-1");
      renderTabLayout();

      const update = (collapsed: Pane) =>
        act(() =>
          tabsAtom.set(
            tabsAtom.get().map((candidate) => ({
              ...candidate,
              panes: { ...candidate.panes, collapsed },
            })),
          ),
        );

      expect(screen.getByRole("button", { name: "~/proj" })).not.toBeNull();

      update(collapsedPane("/Users/tester/proj/src", "sleep 100"));
      fireEvent.focus(screen.getByRole("button", { name: "sleep 100" }));

      expect((await screen.findByRole("tooltip")).textContent).toBe(
        "CWD: /Users/tester/proj/srcCommand: sleep 100",
      );

      update(collapsedPane("/Users/tester/proj/src"));
      expect(screen.getByRole("button", { name: "~/proj/src" })).not.toBeNull();
    },
  );

  it("names a collapsed page by its address when its title is only whitespace", async () => {
    tabsAtom.set([
      collapsedTab("column", {
        id: "collapsed",
        type: "browser",
        url: "https://example.com/",
        title: "  ",
      }),
    ]);
    activeTabIdAtom.set("tab-1");
    renderTabLayout();

    fireEvent.focus(
      screen.getByRole("button", { name: "https://example.com/" }),
    );

    expect((await screen.findByRole("tooltip")).textContent).toBe(
      "URL: https://example.com/",
    );
  });

  it("shows no tooltip for a collapsed pane with nothing in it", async () => {
    tabsAtom.set([collapsedTab("column", { id: "collapsed", type: "canvas" })]);
    activeTabIdAtom.set("tab-1");
    renderTabLayout();

    fireEvent.focus(screen.getByRole("button", { name: "Canvas" }));
    await act(async () => {});

    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
