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

  it("fades only the ends with tabs past them, and doesn't re-render as it scrolls", async () => {
    // Narrows the window until the strip shows only half its tabs
    const narrower = await app.page.evaluate(() => {
      const strip = document.querySelector('[role="tablist"]')!;
      const buttons = document
        .querySelector('[aria-label="View all tabs"]')!
        .getBoundingClientRect().right;
      const end = document
        .querySelector('[aria-label="Show command palette"]')!
        .getBoundingClientRect().left;
      return Math.round(end - buttons + strip.scrollWidth / 2);
    });
    const resize = async (by: number) => {
      const width = await app.page.evaluate(() => window.innerWidth);
      await app.page.evaluate(
        (by) => window.resizeTo(window.outerWidth - by, window.outerHeight),
        by,
      );
      await until(
        async () =>
          (await app.page.evaluate(() => window.innerWidth)) === width - by,
        "the window to resize",
      );
    };
    await resize(narrower);

    // How much each end of the strip fades at each place it scrolls to, and
    // how many times the strip changed along the way
    const scrollThrough = (places: ("start" | "middle" | "end")[]) =>
      app.page.evaluate(async (places) => {
        const tabs = document.querySelector<HTMLElement>('[role="tablist"]')!;
        let strip: HTMLElement = tabs;
        while (!strip.querySelector('[aria-label="Show command palette"]')) {
          strip = strip.parentElement!;
        }
        let changes = 0;
        const observer = new MutationObserver((records) => {
          changes += records.length;
        });
        observer.observe(strip, {
          subtree: true,
          childList: true,
          attributes: true,
        });
        const fades: string[][] = [];
        for (const place of places) {
          const range = tabs.scrollWidth - tabs.clientWidth;
          tabs.scrollLeft = { start: 0, middle: range / 2, end: range }[place];
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          const style = getComputedStyle(tabs);
          fades.push([
            style.getPropertyValue("--scroll-fade-s"),
            style.getPropertyValue("--scroll-fade-e"),
          ]);
        }
        observer.disconnect();
        return { fades, changes };
      }, places);

    expect(await scrollThrough(["start", "middle", "end", "start"])).toEqual({
      fades: [
        ["0px", "48px"],
        ["48px", "48px"],
        ["48px", "0px"],
        ["0px", "48px"],
      ],
      changes: 0,
    });

    // Neither end fades once all its tabs fit
    await resize(
      -(await app.page.evaluate(() => {
        const tabs = document.querySelector('[role="tablist"]')!;
        return tabs.scrollWidth - tabs.clientWidth + 1;
      })),
    );
    expect((await scrollThrough(["start"])).fades).toEqual([["0px", "0px"]]);
  });
});
