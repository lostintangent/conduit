import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { WorkspaceState } from "@features/workspaces/model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, launch, until } from "./app";

const pages: Record<string, string> = {
  "/first": "<!doctype html><title>First</title>",
  "/second": `<!doctype html>
<title>Second</title>
<input id="note">
<div style="height: 6000px"></div>`,
};

let server: http.Server;
let origin: string;
const requested: string[] = [];

beforeAll(async () => {
  server = http.createServer((request, response) => {
    if (request.url !== "/favicon.ico") requested.push(request.url!);
    response.writeHead(200, { "content-type": "text/html" });
    response.end(pages[request.url!] ?? "");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

/** Runs a script in a page, returning what it evaluates to. */
function inWebview<T>(app: Conduit, selector: string, script: string) {
  return app.page
    .locator(selector)
    .first()
    .evaluate(
      (webview: Electron.WebviewTag, code) => webview.executeJavaScript(code),
      script,
    ) as Promise<T>;
}

/** A saved tab with a single pane, which the tab is named after. */
const tab = (id: string, pane: object) => ({
  id,
  name: id,
  activePaneId: `${id}-pane`,
  panes: [{ id: `${id}-pane`, ...pane }],
  layout: { id: `${id}-layout`, type: "pane", paneId: `${id}-pane` },
});

describe("a page reopened at launch", () => {
  let app: Conduit;

  beforeAll(async () => {
    app = await launch({ name: "browser-restore" });
  });

  afterAll(() => app?.close());

  const inPage = <T>(script: string) => inWebview<T>(app, "webview", script);

  it("comes back where it was scrolled, with its typed text and its history", async () => {
    const terminal = await app.terminal();
    expect(await terminal.run("conduit split right -t browser")).toBe(0);
    expect(await terminal.run(`conduit browser-navigate ${origin}/first`)).toBe(
      0,
    );
    await until(() => inPage("document.title === 'First'"), "the first page");
    await inPage("location.href = '/second'");
    await until(() => inPage("document.title === 'Second'"), "the second page");
    await inPage(
      "document.querySelector('#note').value = 'kept'; scrollTo(0, 2000); true",
    );
    // Chromium saves a page's scroll and form values within about a second
    await app.page.waitForTimeout(1500);
    await app.quit();

    requested.length = 0;
    app = await launch({ name: "browser-restore-relaunched", home: app.home });

    await until(() => inPage("document.title === 'Second'"), "the second page");
    await until(
      async () => (await inPage<number>("scrollY")) === 2000,
      "the page to scroll to where it was",
    );
    expect(await inPage("document.querySelector('#note').value")).toBe("kept");
    // The page behind it only loads when the user goes back
    expect(requested).not.toContain("/first");

    await inPage("history.back(); true");
    await until(() => inPage("document.title === 'First'"), "the first page");
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});

describe("a page in a tab behind the one that opens", () => {
  let app: Conduit;

  beforeAll(async () => {
    const state = {
      workspaces: [],
      untitled: {
        lastModified: 0,
        activeTabId: "Shell",
        tabs: [
          tab("Shell", { type: "terminal", cwd: null }),
          tab("Page", { type: "browser", url: `${origin}/first` }),
        ],
      },
    };
    app = await launch({
      name: "background-page",
      files: { ".conduit/workspaces.json": JSON.stringify(state) },
    });
  });

  afterAll(() => app?.close());

  it("shows when its tab is clicked before the page its preview made attaches", async () => {
    const tab = app.page.getByRole("tab", { name: /^Page/ });
    // Hovering the tab previews it, which makes its page. A click that
    // follows sooner than the page can attach shows the tab without it.
    await tab.evaluate((tab: HTMLElement) => {
      new MutationObserver((_, observer) => {
        if (!document.getElementById("Page-pane")) return;
        observer.disconnect();
        tab.click();
      }).observe(document.body, { childList: true });
    });
    await tab.hover();

    await tab.and(app.page.getByRole("tab", { selected: true })).waitFor();
    const page = app.page.locator("webview#Page-pane");
    const crashed = app.page.getByText("This pane crashed");
    const shows = async () =>
      ((await page.boundingBox())?.x ?? -1) >= 0 &&
      (await inWebview(app, "webview#Page-pane", "document.title")) === "First";
    await until(
      async () => (await crashed.count()) > 0 || (await shows()),
      "the page to show, or its pane to crash",
    );
    expect(await crashed.count()).toBe(0);

    // Its toolbar catches up once the page attaches
    const toolbar = app.page.getByRole("tabpanel").filter({ visible: true });
    await toolbar.getByRole("button", { name: "Refresh" }).waitFor();
    expect(
      await toolbar.getByPlaceholder("Search or enter address").inputValue(),
    ).toBe(`${origin}/first`);
  });
});

describe("a page whose tab goes to the background", () => {
  let app: Conduit;

  beforeAll(async () => {
    const state = {
      workspaces: [],
      untitled: {
        lastModified: 0,
        activeTabId: "Page",
        tabs: [
          tab("Page", { type: "browser", url: `${origin}/first` }),
          tab("Shell", { type: "terminal", cwd: null }),
        ],
      },
    };
    // Playwright's focus emulation keeps every page visible to Chromium
    app = await launch({
      name: "hidden-page",
      noDefaults: true,
      files: { ".conduit/workspaces.json": JSON.stringify(state) },
    });
  });

  afterAll(() => app?.close());

  // A covered window hides all of its pages and stops drawing, so this can't
  // expect the page to be visible while its tab shows, and clicks without
  // waiting for a frame
  it("is hidden from Chromium, so it stops drawing", async () => {
    const inPage = <T>(script: string) =>
      inWebview<T>(app, "webview#Page-pane", script);
    await until(() => inPage("document.title === 'First'"), "the page");

    await app.page.getByRole("tab", { name: /^Shell/ }).dispatchEvent("click");
    await until(
      () => inPage("document.visibilityState === 'hidden'"),
      "the page to be hidden",
    );
    const framesInHalfASecond = `new Promise((resolve) => {
      let frames = 0;
      const count = () => { frames++; requestAnimationFrame(count); };
      requestAnimationFrame(count);
      setTimeout(() => resolve(frames), 500);
    })`;
    expect(await inPage(framesInHalfASecond)).toBe(0);
  });
});

describe("a page in a tab that's previewed", () => {
  let app: Conduit;

  beforeAll(async () => {
    const page = { type: "browser", url: `${origin}/first` };
    // Its page is on the right, past the split's divider
    const split = {
      id: "Split",
      name: "Split",
      activePaneId: "Split-canvas",
      panes: [
        { id: "Split-canvas", type: "canvas" },
        { id: "Split-pane", ...page },
      ],
      layout: {
        id: "Split-layout",
        type: "split",
        direction: "row",
        children: [
          { id: "Split-canvas-node", type: "pane", paneId: "Split-canvas" },
          { id: "Split-pane-node", type: "pane", paneId: "Split-pane" },
        ],
      },
    };
    const state = {
      workspaces: [],
      untitled: {
        lastModified: 0,
        activeTabId: "Shell",
        tabs: [
          tab("Shell", { type: "terminal", cwd: null }),
          tab("Page", page),
          split,
        ],
      },
    };
    app = await launch({
      name: "previewed-page",
      files: { ".conduit/workspaces.json": JSON.stringify(state) },
    });
  });

  afterAll(() => app?.close());

  for (const [name, paneId, nodeId] of [
    ["Page", "Page-pane", "Page-layout"],
    ["Split", "Split-pane", "Split-pane-node"],
  ]) {
    const tabButton = () =>
      app.page.getByRole("tab", { name: new RegExp(`^${name}`) });
    const inPage = <T>(script: string) =>
      inWebview<T>(app, `webview#${paneId}`, script);
    const drawn = () =>
      inPage(
        "new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn)))",
      );
    const size = () =>
      app.page
        .locator(`webview#${paneId}`)
        .evaluate((webview: HTMLElement) => ({
          width: webview.offsetWidth,
          height: webview.offsetHeight,
          scaled: webview.style.transform !== "",
          parked: webview.style.left === "-10000px",
        }));
    const preview = async () => {
      await app.page.getByRole("tab", { name: /^Shell/ }).click();
      await until(async () => (await size()).parked, "the page to be put away");
      await tabButton().hover();
      await until(async () => (await size()).scaled, "the tab's preview");
    };

    // Laying a page out again for a different size takes long enough on a
    // big page, like GitHub's, to hold up the frame that shows its tab
    it(`keeps its page's size as the ${name} tab is previewed, then shown`, async () => {
      await tabButton().click();
      await until(
        async () =>
          !(await size()).parked &&
          (await inPage("document.title")) === "First",
        "the page to show",
      );
      const shown = await size();
      await until(
        async () =>
          JSON.stringify(await inPage("[innerWidth, innerHeight]")) ===
          JSON.stringify([shown.width, shown.height]),
        "the page to be laid out at its pane's size",
      );
      await inPage(
        `window.sizes = [];
        addEventListener("resize", () => sizes.push([innerWidth, innerHeight]));`,
      );

      await preview();
      expect(await size()).toEqual({ ...shown, scaled: true });

      await tabButton().click();
      await until(async () => {
        const now = await size();
        return !now.parked && !now.scaled;
      }, "the tab to show");
      expect(await size()).toEqual(shown);
      await drawn();
      expect(await inPage("sizes")).toEqual([]);
    });

    it(`shows the ${name} tab's preview with its border around its page`, async () => {
      await inPage(`document.body.style.background = "rgb(255, 0, 255)"`);
      await preview();
      await drawn();

      // Just inside and just outside the right and bottom of the box the
      // preview clips its content to, which is in its wrapper on the body
      const places = await app.page
        .locator(`webview#${paneId}`)
        .evaluate((webview: HTMLElement, node) => {
          let wrapper = document.querySelector(`[data-node-id="${node}"]`)!;
          while (wrapper.parentElement !== document.body) {
            wrapper = wrapper.parentElement!;
          }
          const box = wrapper.firstElementChild!;
          const outer = box.getBoundingClientRect();
          const right = outer.left + box.clientLeft + box.clientWidth;
          const bottom = outer.top + box.clientTop + box.clientHeight;
          const page = webview.getBoundingClientRect();
          const x = (page.left + Math.min(page.right, right)) / 2;
          const y = (page.top + Math.min(page.bottom, bottom)) / 2;
          return {
            insideRight: [Math.floor(right) - 2, y],
            outsideRight: [Math.ceil(right), y],
            insideBottom: [x, Math.floor(bottom) - 2],
            outsideBottom: [x, Math.ceil(bottom)],
            // Outside the round inside of the preview's border
            corner: [Math.floor(right) - 1, Math.floor(bottom) - 1],
          };
        }, nodeId);
      const png = await app.page.screenshot();
      const isPage = await app.page.evaluate(
        async ({ base64, places }) => {
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const image = await createImageBitmap(new Blob([bytes]));
          const canvas = new OffscreenCanvas(image.width, image.height);
          const context = canvas.getContext("2d")!;
          context.drawImage(image, 0, 0);
          return Object.fromEntries(
            Object.entries(places).map(([place, [x, y]]) => {
              const [r, g, b] = context.getImageData(
                Math.floor(x * devicePixelRatio),
                Math.floor(y * devicePixelRatio),
                1,
                1,
              ).data;
              return [place, r > 200 && g < 60 && b > 200];
            }),
          );
        },
        { base64: png.toString("base64"), places },
      );
      expect(isPage).toEqual({
        insideRight: true,
        outsideRight: false,
        insideBottom: true,
        outsideBottom: false,
        corner: false,
      });
    });
  }
});

describe("a page beside a splitter that's dragged", () => {
  let app: Conduit;

  beforeAll(async () => {
    // The page is on the left, so it would cover the canvas as it narrows
    const split = {
      id: "Split",
      name: "Split",
      activePaneId: "Split-pane",
      panes: [
        { id: "Split-pane", type: "browser", url: `${origin}/first` },
        { id: "Split-canvas", type: "canvas" },
      ],
      layout: {
        id: "Split-layout",
        type: "split",
        direction: "row",
        children: [
          { id: "Split-pane-node", type: "pane", paneId: "Split-pane" },
          { id: "Split-canvas-node", type: "pane", paneId: "Split-canvas" },
        ],
      },
    };
    const state = {
      workspaces: [],
      untitled: { lastModified: 0, activeTabId: "Split", tabs: [split] },
    };
    app = await launch({
      name: "dragged-splitter",
      files: { ".conduit/workspaces.json": JSON.stringify(state) },
    });
  });

  afterAll(() => app?.close());

  // Laying out a big page at every frame of the drag holds up the frames
  it("lays its page out at most every 100ms during the drag, inside its pane, and at its pane's size once it's let go", async () => {
    const inPage = <T>(script: string) =>
      inWebview<T>(app, "webview#Split-pane", script);
    await until(() => inPage("document.title === 'First'"), "the page");
    const pane = app.page.locator('[data-node-id="Split-pane-node"]');
    const sizes = () =>
      pane.evaluate((pane: HTMLElement) => {
        const webview = document.getElementById("Split-pane")!;
        const shown = webview.getBoundingClientRect();
        // The part of the page cut off at the right, while it's wider than
        // its pane
        const right =
          getComputedStyle(webview).clipPath.match(
            /^inset\([\d.]+px ([\d.]+)px/,
          )?.[1] ?? "0";
        return {
          paneRight: pane.getBoundingClientRect().right,
          pageRight: shown.right - Number(right),
          pageWidth: webview.offsetWidth,
        };
      });
    await until(
      async () => (await inPage("innerWidth")) === (await sizes()).pageWidth,
      "the page to be laid out at its pane's size",
    );
    await inPage(
      `window.sizes = [];
      addEventListener("resize", () => sizes.push(innerWidth));`,
    );

    const handle = (await app.page
      .locator("div.cursor-col-resize")
      .filter({ visible: true })
      .first()
      .boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    const now = () => app.page.evaluate(() => performance.now());
    await app.page.mouse.move(x, y);
    await app.page.mouse.down();
    const start = await now();
    for (let step = 1; step <= 30; step++) {
      await app.page.mouse.move(x - step * 5, y);
      // Each move in a frame of its own, as a hand drags
      await app.page.evaluate(
        () => new Promise((drawn) => requestAnimationFrame(drawn)),
      );
      const { paneRight, pageRight } = await sizes();
      expect(pageRight - paneRight).toBeLessThan(1);
    }
    const elapsed = (await now()) - start;
    expect((await inPage<number[]>("sizes")).length).toBeLessThanOrEqual(
      Math.floor(elapsed / 100) + 1,
    );

    await app.page.mouse.up();
    await until(async () => {
      const { paneRight, pageRight, pageWidth } = await sizes();
      return (
        Math.abs(pageRight - paneRight) < 1 &&
        (await inPage("innerWidth")) === pageWidth
      );
    }, "the page to be laid out at its pane's size");
  });
});

describe("the sidebar's page", () => {
  let app: Conduit;
  const terminalTab = (id: string) => ({
    id,
    activePaneId: `${id}-pane`,
    panes: [{ id: `${id}-pane`, type: "terminal", cwd: null }],
    layout: { id: `${id}-layout`, type: "pane", paneId: `${id}-pane` },
  });

  beforeAll(async () => {
    const state = {
      workspaces: [
        {
          name: "Elsewhere",
          lastModified: 0,
          activeTabId: "there",
          tabs: [terminalTab("there")],
        },
      ],
      untitled: {
        lastModified: 0,
        activeTabId: "here",
        tabs: [terminalTab("here")],
        sidebarPage: { url: `${origin}/first`, isOpen: true },
      },
    };
    app = await launch({
      name: "sidebar-page",
      files: { ".conduit/workspaces.json": JSON.stringify(state) },
    });
  });

  afterAll(() => app?.close());

  const sidebarPage = () => app.page.locator("webview#sidebar-browser");
  const inSidebar = <T>(script: string) =>
    inWebview<T>(app, "webview#sidebar-browser", script);
  const saved = (): WorkspaceState =>
    JSON.parse(
      fs.readFileSync(path.join(app.home, ".conduit/workspaces.json"), "utf8"),
    );
  /** Its webview outlives the sidebar, off screen while it's closed. */
  const sidebarIsOpen = async () => {
    const box = await sidebarPage().boundingBox();
    return !!box && box.x + box.width > 0;
  };
  const sidebarShows = (title: string) =>
    until(
      async () =>
        (await sidebarIsOpen()) &&
        (await inSidebar(`document.title === ${JSON.stringify(title)}`)),
      `the sidebar to show ${title}`,
    );

  async function choose(item: string) {
    await app.page.getByRole("button", { name: "Workspaces" }).click();
    await app.page.getByRole("menuitem", { name: item }).click();
    await app.page.getByRole("menu").waitFor({ state: "detached" });
  }

  it("opens with the workspace, and saves where it goes", async () => {
    await sidebarShows("First");

    const terminal = await app.terminal();
    expect(
      await terminal.run(`conduit browser-navigate ${origin}/second`),
    ).toBe(0);
    await sidebarShows("Second");
    await until(
      () => saved().untitled?.sidebarPage?.url === `${origin}/second`,
      "the sidebar's new page to save",
      10_000,
    );
    expect(saved().untitled?.sidebarPage?.isOpen).toBe(true);
  });

  it("goes with its workspace, and comes back without the other's history", async () => {
    await choose("Elsewhere");
    await until(
      async () =>
        !(await sidebarIsOpen()) &&
        (await inSidebar("location.href === 'about:blank'")),
      "the sidebar to close and leave its page",
    );

    await choose("Close Workspace");
    await sidebarShows("Second");
    expect(await inSidebar("history.length")).toBe(1);
  });

  it("reopens at launch where it was", async () => {
    await app.quit();
    app = await launch({ name: "sidebar-page-relaunched", home: app.home });

    await sidebarShows("Second");
    // Only its address saves
    expect(await inSidebar("history.length")).toBe(1);
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});
