import { act, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

const findRoot = vi.hoisted(() => {
  const findRoot = vi.fn(async (_cwd: string) => "/repo");
  (window as any).conduit = { git: { findRoot } };
  return findRoot;
});

import { TabStrip } from "@/components/shell/tabs/TabStrip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/query";
import { activeTabIdAtom, tabsAtom } from "@/store/atoms";
import type { Tab } from "@/types";
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

function updateTerminal(updates: { cwd?: string; title?: string }) {
  act(() =>
    tabsAtom.set([
      { ...tab, panes: { term: { ...tab.panes.term, ...updates } } },
    ]),
  );
}

describe("TabStrip", () => {
  // Tab labels read the home directory outside React
  beforeAll(() => seedSettings(queryClient));

  it("checks the active terminal's repo again as it changes directory or runs a command", async () => {
    tabsAtom.set([tab]);
    activeTabIdAtom.set("tab-1");
    render(
      <TooltipProvider>
        <TabStrip />
      </TooltipProvider>,
    );
    await waitFor(() => expect(findRoot).toHaveBeenCalledTimes(1));

    // As after `git init`, which retitles the shell but stays put
    updateTerminal({ title: "git init" });
    updateTerminal({ title: "git init", cwd: "/other" });

    await waitFor(() => expect(findRoot).toHaveBeenCalledTimes(3));
    expect(findRoot.mock.calls).toEqual([["/repo"], ["/repo"], ["/other"]]);
  });
});
