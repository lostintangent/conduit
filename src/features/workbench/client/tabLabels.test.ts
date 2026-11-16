import { beforeAll, describe, expect, it } from "vitest";
import { queryClient } from "@/query";
import { activeTabIdAtom, tabsAtom } from "@features/workbench/client/atoms";
import {
  describePane,
  tabLabelsAtom,
} from "@features/workbench/client/tabLabels";
import type { Pane } from "@features/workbench/model";
import { seedSettings } from "../../../../tests/renderer/queryRender";

const terminal = (title?: string): Pane => ({
  id: "term",
  type: "terminal",
  sessionId: "session-1",
  cwd: "/Users/tester/proj",
  title,
});

describe("describePane", () => {
  it("labels a terminal by the command it's running, with its folder still in the tooltip", () => {
    expect(describePane(terminal("bun dev"), "/Users/tester")).toEqual({
      label: "bun dev",
      tooltip: { CWD: "/Users/tester/proj", Command: "bun dev" },
    });
  });

  it.each(["zsh", "bash", "fish"])(
    "labels a terminal by its folder while %s is at its prompt",
    (shell) => {
      expect(describePane(terminal(shell), "/Users/tester").label).toBe(
        "~/proj",
      );
    },
  );

  it("labels a terminal by its folder before its shell has titled it", () => {
    expect(describePane(terminal(), "/Users/tester").label).toBe("~/proj");
  });

  // Until its shell titles it, a terminal is titled with the shell's path.
  it("labels a terminal by its folder while it's titled with its shell's path", () => {
    expect(describePane(terminal("/bin/zsh"), "/Users/tester").label).toBe(
      "~/proj",
    );
  });
});

describe("tabLabelsAtom", () => {
  // Tab labels read the home directory outside React
  beforeAll(() => seedSettings(queryClient));

  it("labels a tab by the command its terminal is running, and by its folder once it's done", () => {
    const tab = (title: string) => ({
      id: "tab-1",
      panes: { term: terminal(title) },
      layout: { id: "node-term", type: "pane" as const, paneId: "term" },
      activePaneId: "term",
    });
    tabsAtom.set([tab("tailscale serve 3000")]);
    activeTabIdAtom.set("tab-1");

    expect(tabLabelsAtom.get()[0].label).toBe("tailscale serve 3000");

    tabsAtom.set([tab("zsh")]);

    expect(tabLabelsAtom.get()[0].label).toBe("~/proj");
  });
});
