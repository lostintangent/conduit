import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openExternal = vi.hoisted(() => {
  const openExternal = vi.fn();
  (window as any).conduit = { openExternal };
  return openExternal;
});

let terminalProps: { onLinkClick: (url: string) => void } | undefined;
vi.mock("@features/terminal/components/TerminalPane", () => ({
  TerminalPane: (props: { onLinkClick: (url: string) => void }): null => {
    terminalProps = props;
    return null;
  },
}));

import { TabContentPortalProvider } from "@/components/layout/normal/TabContentPortalContext";
import { TabLayout } from "@/components/layout/normal/TabLayout";
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

function renderTabLayout() {
  render(
    <TabContentPortalProvider>
      <TabLayout
        handleContextMenu={vi.fn()}
        handleResizeStart={vi.fn()}
        resizingNode={null}
        handleBrowserUpdate={vi.fn()}
        handleEditorUpdate={vi.fn()}
      />
    </TabContentPortalProvider>,
    { queryClient },
  );
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
