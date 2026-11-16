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
