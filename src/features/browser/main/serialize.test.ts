import type { NavigationEntry } from "electron";
import { describe, expect, it, vi } from "vitest";
import type { BrowserPane } from "@features/workbench/model";
import { restoreAddress } from "../model";

type Page = {
  entries: NavigationEntry[];
  active: number;
  destroyed?: boolean;
};
const pages = new Map<number, Page>();

vi.mock("electron", () => ({
  webContents: {
    fromId: (id: number) => {
      const page = pages.get(id);
      return (
        page && {
          isDestroyed: () => page.destroyed ?? false,
          navigationHistory: {
            getAllEntries: () => page.entries.map((entry) => ({ ...entry })),
            getActiveIndex: () => page.active,
          },
        }
      );
    },
  },
}));

import { SAVED_HISTORY_LENGTH, serializeBrowserPane } from "./serialize";

const entry = (url: string): NavigationEntry => ({
  url,
  title: url,
  pageState: `state of ${url}`,
});
const pane = (webContentsId?: number): BrowserPane => ({
  id: "p",
  type: "browser",
  url: "https://example.com/",
  title: "Example",
  webContentsId,
});
const saved = { index: 0, entries: [entry("https://saved.com/")] };

describe("serializeBrowserPane", () => {
  it(`saves ${SAVED_HISTORY_LENGTH} pages back and forward of the page's history, with their state`, () => {
    const urls = Array.from({ length: 20 }, (_, n) => `https://site.com/${n}`);
    pages.set(1, { entries: urls.map(entry), active: 10 });

    expect(serializeBrowserPane(pane(1))).toEqual({
      id: "p",
      type: "browser",
      url: "https://example.com/",
      title: "Example",
      navigation: { index: 6, entries: urls.slice(4, 17).map(entry) },
    });
  });

  it("leaves out pages that aren't the user's", () => {
    pages.set(2, {
      entries: [
        entry(""),
        entry("https://a.com/"),
        entry("devtools://devtools/bundled/inspector.html"),
        entry("https://b.com/"),
      ],
      active: 3,
    });

    expect(serializeBrowserPane(pane(2)).navigation).toEqual({
      index: 1,
      entries: [entry("https://a.com/"), entry("https://b.com/")],
    });
  });

  it("keeps the history it was saved with until its page attaches", () => {
    pages.set(3, {
      entries: [entry(restoreAddress("p", "https://a.com/"))],
      active: 0,
    });
    pages.set(4, { entries: [], active: -1 });
    pages.set(5, {
      entries: [entry("https://a.com/")],
      active: 0,
      destroyed: true,
    });

    for (const id of [undefined, 3, 4, 5, 6]) {
      expect(serializeBrowserPane(pane(id), saved).navigation).toBe(saved);
      expect(serializeBrowserPane(pane(id))).not.toHaveProperty("navigation");
    }
  });

  it("saves only which page a DevTools pane inspects", () => {
    pages.set(7, { entries: [entry("devtools://devtools/")], active: 0 });

    expect(
      serializeBrowserPane({ ...pane(7), devToolsFor: "q" }, saved),
    ).toEqual({
      id: "p",
      type: "browser",
      url: "https://example.com/",
      title: "Example",
      devToolsFor: "q",
    });
  });
});
