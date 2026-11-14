import { act, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

const findRoot = vi.hoisted(() => {
  const findRoot = vi.fn(async (_cwd: string) => "/repo");
  (window as any).conduit = { git: { findRoot } };
  return findRoot;
});

// The tab of each tab button render
const tabButtonRenders: string[] = [];
vi.mock("@/components/shell/tabs/TabButton", async () => {
  const { TabButton } = await vi.importActual<
    typeof import("@/components/shell/tabs/TabButton")
  >("@/components/shell/tabs/TabButton");
  return {
    TabButton: (props: ComponentProps<typeof TabButton>) => {
      tabButtonRenders.push(props.tabId);
      return TabButton(props);
    },
  };
});

import { TabStrip } from "@/components/shell/tabs/TabStrip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createQueryClient, queryClient } from "@/query";
import { activeTabIdAtom, tabsAtom } from "@/store/atoms";
import type { Tab } from "@/types";
import type { UserSettings } from "@features/settings/model";
import { render, seedSettings } from "../../../queryRender";

const tab: Tab = {
  id: "tab-1",
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

function withTerminal(
  base: Tab,
  updates: { cwd?: string; title?: string },
): Tab {
  return { ...base, panes: { term: { ...base.panes.term, ...updates } } };
}

function updateTerminal(updates: { cwd?: string; title?: string }) {
  act(() => tabsAtom.set([withTerminal(tab, updates)]));
}

function renderStrip(settings?: Partial<UserSettings>) {
  render(
    <TooltipProvider>
      <TabStrip />
    </TooltipProvider>,
    { queryClient: seedSettings(createQueryClient(), settings) },
  );
}

describe("TabStrip", () => {
  // Tab labels read the home directory outside React
  beforeAll(() => seedSettings(queryClient));

  it("checks the active terminal's repo again as it changes directory or runs a command", async () => {
    tabsAtom.set([tab]);
    activeTabIdAtom.set("tab-1");
    renderStrip({ showLaunchButton: true });
    await waitFor(() => expect(findRoot).toHaveBeenCalledTimes(1));

    // As after `git init`, which retitles the shell but stays put
    updateTerminal({ title: "git init" });
    updateTerminal({ title: "git init", cwd: "/other" });

    await waitFor(() => expect(findRoot).toHaveBeenCalledTimes(3));
    expect(findRoot.mock.calls).toEqual([["/repo"], ["/repo"], ["/other"]]);
  });

  it("doesn't look for a repo while the launch button is hidden", () => {
    tabsAtom.set([tab]);
    activeTabIdAtom.set("tab-1");
    renderStrip();

    updateTerminal({ title: "git init", cwd: "/other" });

    expect(findRoot).not.toHaveBeenCalled();
  });

  it("re-renders only the button of a tab whose shell retitles itself", () => {
    const shell = withTerminal(tab, { cwd: undefined });
    tabsAtom.set([shell, { ...shell, id: "tab-2" }]);
    activeTabIdAtom.set("tab-1");
    renderStrip();

    for (const tabId of ["tab-2", "tab-1"]) {
      tabButtonRenders.length = 0;
      act(() =>
        tabsAtom.set((tabs) =>
          tabs.map((candidate) =>
            candidate.id === tabId
              ? withTerminal(candidate, { title: `vim ${tabId}` })
              : candidate,
          ),
        ),
      );

      // Without a directory, the title is the label
      expect(screen.getByText(`vim ${tabId}`)).toBeTruthy();
      expect(tabButtonRenders).toEqual([tabId]);
    }
  });
});
