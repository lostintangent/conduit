import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, happens, launch, runCommand, until } from "./app";

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

  describe("a tab's preview", () => {
    const preview = () => app.page.locator("[data-tab-preview]");
    const isClosed = async () => (await preview().count()) === 0;

    const tab = (name: string) =>
      app.page.getByRole("tab", { name: new RegExp(`^${name}`) });

    /**
     * Hovers a tab, then moves up into its preview a pixel at a time, as a
     * hand would, and returns where the pointer ends up.
     */
    async function enterPreview(name: string) {
      await tab(name).hover();
      const from = (await tab(name).boundingBox())!;
      const to = (await preview().boundingBox())!;
      const x = from.x + from.width / 2;
      const y = to.y + to.height - 10;
      await app.page.mouse.move(x, y, {
        steps: Math.ceil(from.y + from.height / 2 - y),
      });
      return { x, y };
    }

    it("stays as the pointer crosses into it, where a click opens its tab", async () => {
      const { x, y } = await enterPreview("Two");
      expect(await happens(isClosed, "the preview to close")).toBe(false);

      await app.page.mouse.click(x, y);
      await tab("Two")
        .and(app.page.getByRole("tab", { selected: true }))
        .waitFor();
      await preview().waitFor({ state: "detached" });
      await tab("One").click();
    });

    it("closes once the pointer leaves the tab for elsewhere in the window", async () => {
      await tab("Two").hover();
      await preview().waitFor();
      const { x, y } = await app.page.evaluate(() => ({
        x: innerWidth / 2,
        y: innerHeight / 3,
      }));
      await app.page.mouse.move(x, y, { steps: 10 });
      await preview().waitFor({ state: "detached" });
    });

    it("closes once the pointer leaves the window from it", async () => {
      const { x } = await enterPreview("Two");
      // Straight out, so the preview is the last thing it's on
      await app.page.mouse.move(x, -40);
      await preview().waitFor({ state: "detached" });
    });
  });

  /** Opens a tab one way, and waits for it to be the selected one. */
  async function openTab(open: () => Promise<void>) {
    const tabs = app.page.getByRole("tab");
    const count = await tabs.count();
    await open();
    await tabs
      .nth(count)
      .and(app.page.getByRole("tab", { selected: true }))
      .waitFor();
  }

  /** Picks the item from the menu next to New Tab. */
  async function chooseNewTab(item: string) {
    await app.page
      .getByRole("button", { name: "More new tab options" })
      .click();
    await app.page.getByRole("menuitem", { name: item }).click();
    await app.page.getByRole("menu").waitFor({ state: "detached" });
  }

  /**
   * How each kind of pane shows in its tab, and what takes the keys when it
   * opens: the address bar, the file tree, the canvas or the shell. A page's
   * webview lives outside its tab, on the body.
   */
  const panes = {
    Browser: {
      shows: '[placeholder="Search or enter address"]',
      focuses: '[placeholder="Search or enter address"]',
    },
    Editor: {
      shows: '[data-testid="tree-container"]',
      focuses:
        '[data-testid="tree-container"], [data-testid="tree-container"] *',
    },
    Canvas: { shows: 'canvas[id^="canvas-"]', focuses: ":has(> div > canvas)" },
    Terminal: { shows: ".xterm", focuses: ".xterm-helper-textarea" },
  };
  type Kind = keyof typeof panes;

  /**
   * The selected tab's panes and splits, how many of them show as the kind,
   * and whether the kind has the keys.
   */
  const shown = (kind: Kind) =>
    app.page.evaluate(({ shows, focuses }) => {
      const panel = [...document.querySelectorAll('[role="tabpanel"]')].find(
        (panel) => panel.checkVisibility(),
      )!;
      const focused = document.activeElement;
      return {
        nodes: panel.querySelectorAll("[data-node-id]").length,
        shown: panel.querySelectorAll(shows).length,
        focused:
          !!focused && panel.contains(focused) && focused.matches(focuses),
      };
    }, panes[kind]);

  /** Waits for the selected tab to have only a pane of the kind, with the keys. */
  async function expectOnly(kind: Kind) {
    await until(
      async () => (await shown(kind)).focused,
      `the ${kind.toLowerCase()} to take the keys`,
    );
    expect(await shown(kind)).toEqual({ nodes: 1, shown: 1, focused: true });
  }

  it("opens a tab with only a terminal from New Tab", async () => {
    await openTab(() =>
      app.page.getByRole("button", { name: "New Tab", exact: true }).click(),
    );
    await expectOnly("Terminal");
  });

  it("offers a tab with each kind of pane next to New Tab, a page first", async () => {
    await app.page
      .getByRole("button", { name: "More new tab options" })
      .click();
    expect(await app.page.getByRole("menuitem").allTextContents()).toEqual([
      "New Tab with Browser",
      "New Tab with Editor",
      "New Tab with Canvas",
      "New Tab with Terminal",
    ]);
    await app.page.keyboard.press("Escape");
    await app.page.getByRole("menu").waitFor({ state: "detached" });
  });

  it("offers a quick terminal or browser next to the hyper terminal, after it", async () => {
    await app.page
      .getByRole("button", { name: "More quick pane options" })
      .click();
    expect(await app.page.getByRole("menuitem").allTextContents()).toEqual([
      "Hyper Terminal",
      "Quick Terminal",
      "Quick Browser",
    ]);
    await app.page.keyboard.press("Escape");
    await app.page.getByRole("menu").waitFor({ state: "detached" });
  });

  for (const kind of Object.keys(panes) as Kind[]) {
    it(`opens New Tab with ${kind} from the menu next to New Tab, with only that pane, which takes the keys`, async () => {
      await openTab(() => chooseNewTab(`New Tab with ${kind}`));
      await expectOnly(kind);
    });
  }

  // New Tab is the terminal's command
  for (const kind of ["Browser", "Editor", "Canvas"] as const) {
    it(`opens New Tab with ${kind} from the command palette, with only that pane, which takes the keys`, async () => {
      await openTab(() => runCommand(app.page, `New Tab with ${kind}`));
      await expectOnly(kind);
    });
  }
});
