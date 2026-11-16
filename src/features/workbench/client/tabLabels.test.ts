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

  it("shows its active page's icon, before its name when it has one", () => {
    const icon = { src: "data:image/png;base64,AAAA", template: false };
    const tab = (name?: string, activePaneId = "page") => ({
      id: "tab-1",
      name,
      panes: {
        page: { id: "page", type: "browser" as const, url: "", icon },
        term: terminal("zsh"),
      },
      layout: {
        id: "split",
        type: "split" as const,
        direction: "row" as const,
        children: [
          { id: "node-page", type: "pane" as const, paneId: "page" },
          { id: "node-term", type: "pane" as const, paneId: "term" },
        ],
      },
      activePaneId,
    });
    tabsAtom.set([tab()]);
    activeTabIdAtom.set("tab-1");

    expect(tabLabelsAtom.get()[0].icon).toBe(icon);

    tabsAtom.set([tab("Docs")]);

    expect(tabLabelsAtom.get()[0]).toMatchObject({ label: "Docs", icon });

    tabsAtom.set([tab("Docs", "term")]);

    expect(tabLabelsAtom.get()[0]).toMatchObject({ label: "Docs" });
    expect(tabLabelsAtom.get()[0].icon).toBeUndefined();
  });

  it("plays while any of its pages plays unmuted, or else shows that they're muted", () => {
    const page = (id: string, sound: { audible?: boolean; muted?: boolean }) =>
      ({ id, type: "browser", url: "", ...sound }) as const;
    // Its terminal shows, so its pages' sound shows from behind it
    const tab = (...pages: ReturnType<typeof page>[]) => ({
      id: "tab-1",
      panes: {
        term: terminal(),
        ...Object.fromEntries(pages.map((pane) => [pane.id, pane])),
      },
      layout: { id: "node-term", type: "pane" as const, paneId: "term" },
      activePaneId: "term",
    });
    const soundOf = (...pages: ReturnType<typeof page>[]) => {
      tabsAtom.set([tab(...pages)]);
      return tabLabelsAtom.get()[0].sound;
    };
    activeTabIdAtom.set("tab-1");

    expect(soundOf(page("a", {}))).toBeUndefined();
    expect(soundOf(page("a", { audible: true }))).toBe("playing");
    expect(
      soundOf(
        page("a", { audible: true, muted: true }),
        page("b", { audible: true }),
      ),
    ).toBe("playing");
    expect(soundOf(page("a", { audible: true, muted: true }))).toBe("muted");
    // Muted stays after the page goes quiet, until the user unmutes it
    expect(soundOf(page("a", { muted: true }), page("b", {}))).toBe("muted");
  });
});
