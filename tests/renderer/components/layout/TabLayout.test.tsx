import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const openExternal = vi.hoisted(() => {
  const openExternal = vi.fn();
  (window as any).conduit = { openExternal };
  return openExternal;
});

let terminalProps: { onLinkClick: (url: string) => void } | undefined;
vi.mock("@/components/panes/terminal/TerminalPane", () => ({
  TerminalPane: (props: { onLinkClick: (url: string) => void }): null => {
    terminalProps = props;
    return null;
  },
}));

import { TabContentPortalProvider } from "@/components/layout/normal/TabContentPortalContext";
import { TabLayout } from "@/components/layout/normal/TabLayout";
import { activeTabIdAtom, tabsAtom, userSettingsAtom } from "@/store/atoms";
import type { Tab } from "@/types";
import { enableMapSet } from "immer";
import { getDefaultStore } from "jotai";

enableMapSet();

const store = getDefaultStore();

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
  );
}

describe("TabLayout terminal links", () => {
  beforeEach(() => {
    terminalProps = undefined;
    openExternal.mockClear();
    store.set(tabsAtom, [tab]);
    store.set(activeTabIdAtom, "tab-1");
  });

  it("opens links in the default browser when that's the link target", () => {
    store.set(userSettingsAtom, {
      ...store.get(userSettingsAtom),
      terminalLinkTarget: "default",
    });
    renderTabLayout();

    act(() => terminalProps!.onLinkClick("https://example.com"));

    expect(openExternal).toHaveBeenCalledWith("https://example.com");
    expect(store.get(tabsAtom)[0].panes).toEqual(tab.panes);
  });
});
