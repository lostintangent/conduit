import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, launch, until } from "./app";

describe("the tab strip", () => {
  let app: Conduit;

  beforeAll(async () => {
    const tab = (id: string, pane: object) => ({
      id,
      name: id,
      activePaneId: `${id}-pane`,
      panes: [{ id: `${id}-pane`, ...pane }],
      layout: { id: `${id}-layout`, type: "pane", paneId: `${id}-pane` },
    });
    // Named, so their labels hold still, and canvases behind the first, so
    // no shell's output marks them
    const state = {
      workspaces: [],
      untitled: {
        lastModified: 0,
        activeTabId: "One",
        tabs: [
          tab("One", { type: "terminal", cwd: null }),
          ...["Two", "Three", "Four", "Five", "Six"].map((id) =>
            tab(id, { type: "canvas" }),
          ),
        ],
      },
    };
    app = await launch({
      name: "tab-strip",
      files: { ".conduit/workspaces.json": JSON.stringify(state) },
    });
  });

  afterAll(() => app?.close());

  it("holds still at a width where its tabs fit and the buttons after them don't", async () => {
    await app.page.getByRole("tab", { name: /^Six/ }).waitFor();
    await app.page.getByRole("button", { name: "View all tabs" }).waitFor();

    // Narrows the window so the strip has room for its tabs but not for the
    // buttons after them, which come up short by half their width
    const narrower = await app.page.evaluate(() => {
      const right = (element: Element) => element.getBoundingClientRect().right;
      const tabs = right(
        [...document.querySelectorAll('[role="tab"]')].at(-1)!,
      );
      const buttons = right(
        document.querySelector('[aria-label="View all tabs"]')!,
      );
      const end = document
        .querySelector('[aria-label="Show command palette"]')!
        .getBoundingClientRect().left;
      return Math.round(end - (tabs + buttons) / 2);
    });
    const width = await app.page.evaluate(() => window.innerWidth);
    await app.page.evaluate(
      (by) => window.resizeTo(window.outerWidth - by, window.outerHeight),
      narrower,
    );
    await until(
      async () =>
        (await app.page.evaluate(() => window.innerWidth)) === width - narrower,
      "the window to narrow",
    );

    const changes = await app.page.evaluate(async () => {
      const frames = (count: number) =>
        new Promise<void>((resolve) => {
          const next = () =>
            --count ? requestAnimationFrame(next) : resolve();
          requestAnimationFrame(next);
        });
      // The whole strip, out to the buttons at its far end
      let strip = document.querySelector('[role="tablist"]')!;
      while (!strip.querySelector('[aria-label="Show command palette"]')) {
        strip = strip.parentElement!;
      }
      let changes = 0;
      const observer = new MutationObserver((records) => {
        changes += records.length;
      });
      // Lets it lay out at its new width first
      await frames(2);
      observer.observe(strip, {
        subtree: true,
        childList: true,
        attributes: true,
      });
      await frames(60);
      observer.disconnect();
      return changes;
    });
    expect(changes).toBe(0);
  });
});
