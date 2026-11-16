import { describe, expect, it } from "vitest";
import type { Tab } from "@features/workbench/model";
import handlers from "./handler";

describe("pane-list", () => {
  it("lists a page without its icon, which is an image", async () => {
    const tab = {
      id: "tab-1",
      panes: {
        page: {
          id: "page",
          type: "browser",
          url: "https://example.com/",
          title: "Example",
          icon: { src: "data:image/png;base64,AAAA", template: false },
        },
      },
      layout: { id: "node-page", type: "pane", paneId: "page" },
      activePaneId: "page",
    } as Tab;

    const panes = await handlers["pane-list"](
      { paneType: "browser" },
      {
        sessionId: "shell",
        activeTab: tab,
        activeCwd: "/",
        findCallingTerminalTab: () => tab,
      },
    );

    expect(panes).toEqual([
      {
        id: "page",
        type: "browser",
        url: "https://example.com/",
        title: "Example",
      },
    ]);
  });
});
