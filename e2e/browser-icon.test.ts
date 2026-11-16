import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Locator } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, launch, until } from "./app";

/** A red square, which keeps its own color */
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#e11d48"/></svg>`;
/** A dark mark on a clear ground, like GitHub's, which takes its label's color */
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#24292f"/></svg>`;

const page = (title: string, icon?: string) =>
  `<!doctype html><title>${title}</title>${icon ? `<link rel="icon" href="${icon}">` : ""}`;

const files: Record<string, [type: string, body: string]> = {
  "/square": ["text/html", page("Square", "/square.svg")],
  "/mark": ["text/html", page("Mark", "/mark.svg")],
  // Its favicon.ico is a page saying it's not found
  "/plain": ["text/html", page("Plain")],
  "/square.svg": ["image/svg+xml", square],
  "/mark.svg": ["image/svg+xml", mark],
};

/** Icon requests that wait for a test to answer them, while it holds them */
let holdIcons = false;
const heldIcons: (() => void)[] = [];
/** The icons asked for, and the cookies they were asked for with */
const iconRequests: { url: string; cookie?: string }[] = [];

function serve(request: http.IncomingMessage, response: http.ServerResponse) {
  const [type, body] = files[request.url!] ?? ["text/html", "Not found"];
  if (type.startsWith("image/")) {
    iconRequests.push({
      url: `http://${request.headers.host}${request.url}`,
      cookie: request.headers.cookie,
    });
  }
  const respond = () => {
    response.writeHead(body === "Not found" ? 404 : 200, {
      "content-type": type,
      // Like a signed-in site's, which only its own pages should send
      ...(request.url === "/square" && {
        "set-cookie": "session=1; SameSite=Strict",
      }),
    });
    response.end(body);
  };
  if (holdIcons && type.startsWith("image/")) heldIcons.push(respond);
  else respond();
}

function answerHeldIcons() {
  holdIcons = false;
  heldIcons.splice(0).forEach((respond) => respond());
}

/** Two sites, as the same pages on two hosts, which don't share cookies */
const servers = [http.createServer(serve), http.createServer(serve)];
let site: string;
let other: string;

beforeAll(async () => {
  [site, other] = await Promise.all(
    servers.map(async (server, index) => {
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const host = index === 0 ? "localhost" : "127.0.0.1";
      return `http://${host}:${(server.address() as AddressInfo).port}`;
    }),
  );
  // Links to the first site's icon, as gist.github.com does to GitHub's
  files["/elsewhere"] = ["text/html", page("Elsewhere", `${site}/square.svg`)];
});

afterAll(() => {
  answerHeldIcons();
  for (const server of servers) server.close();
});

/**
 * Two tabs without names, so their active panes label them: one with a page,
 * and one with a shell beside a page.
 */
const workspace = () => ({
  workspaces: [],
  untitled: {
    lastModified: 0,
    activeTabId: "Page",
    tabs: [
      {
        id: "Page",
        activePaneId: "Page-pane",
        panes: [{ id: "Page-pane", type: "browser", url: `${site}/square` }],
        layout: { id: "Page-layout", type: "pane", paneId: "Page-pane" },
      },
      {
        id: "Split",
        activePaneId: "Split-shell",
        panes: [
          { id: "Split-shell", type: "terminal", cwd: null },
          { id: "Split-page", type: "browser", url: `${site}/mark` },
        ],
        layout: {
          id: "Split-layout",
          type: "split",
          direction: "row",
          children: [
            { id: "Split-shell-node", type: "pane", paneId: "Split-shell" },
            { id: "Split-page-node", type: "pane", paneId: "Split-page" },
          ],
        },
      },
    ],
  },
});

describe("a page's icon", () => {
  let app: Conduit;

  beforeAll(async () => {
    app = await launch({
      name: "browser-icon",
      files: { ".conduit/workspaces.json": JSON.stringify(workspace()) },
    });
  });

  afterAll(() => app?.close());

  const tab = (name: RegExp) => app.page.getByRole("tab", { name });
  const showTab = async (index: number) => {
    const tab = app.page.getByRole("tab").nth(index);
    await tab.click();
    await until(
      async () => (await tab.getAttribute("aria-selected")) === "true",
      `tab ${index} to show`,
    );
  };
  const iconIn = (locator: Locator) => locator.locator("[data-page-icon]");
  const bar = () => app.page.locator('[data-node-id="Split-page-node"] button');

  /**
   * Goes to `url` in the first tab's page, and waits for it to get there, and
   * for its tab to say `label`.
   */
  async function go(url: string, label?: RegExp) {
    const webview = app.page.locator("webview#Page-pane");
    await webview.evaluate(
      (webview: Electron.WebviewTag, url) =>
        webview.executeJavaScript(`location.href = ${JSON.stringify(url)}`),
      url,
    );
    await until(
      async () =>
        (await webview.evaluate((webview: Electron.WebviewTag) =>
          webview.getURL(),
        )) === url,
      `the page to go to ${url}`,
    );
    if (label) await tab(label).waitFor();
  }

  async function runCommand(title: string) {
    await app.page.keyboard.press("Meta+Shift+p");
    const palette = app.page.getByTestId("command-palette");
    await palette.getByRole("textbox").fill(`>${title}`);
    await palette
      .locator('[data-index="0"]')
      .filter({ hasText: title })
      .waitFor();
    await app.page.keyboard.press("Enter");
    await palette.waitFor({ state: "hidden" });
  }

  it("shows before the page's title on its tab", async () => {
    const icon = iconIn(tab(/^Square/));
    await icon.waitFor();

    expect(await icon.getAttribute("data-page-icon")).toBe("color");
    expect(
      await icon.evaluate((icon) => icon.nextElementSibling?.textContent),
    ).toBe("Square");
  });

  it("leaves with its site, before the next site's icon has loaded", async () => {
    await iconIn(tab(/^Square/)).waitFor();
    holdIcons = true;
    await go(`${other}/mark`, /^Mark/);
    await until(
      () => heldIcons.length > 0,
      "the next site's icon to be asked for",
    );
    await app.page.evaluate(() => new Promise(requestAnimationFrame));

    expect(await iconIn(tab(/^Mark/)).count()).toBe(0);
  });

  it("takes its title's color when it's a single shade on a clear ground", async () => {
    answerHeldIcons();
    const icon = iconIn(tab(/^Mark/));
    await until(
      async () => (await icon.getAttribute("data-page-icon")) === "template",
      "the mark to show in its title's color",
    );

    const [iconColor, titleColor] = await icon.evaluate((icon) => [
      getComputedStyle(icon).backgroundColor,
      getComputedStyle(icon.parentElement!).color,
    ]);
    expect(iconColor).toBe(titleColor);
  });

  it("goes when the site's next page has none", async () => {
    await iconIn(tab(/^Mark/)).waitFor();
    await go(`${other}/plain`, /^Plain/);

    await until(
      async () => (await iconIn(tab(/^Plain/)).count()) === 0,
      "the mark to go",
    );
  });

  it("goes when the page goes blank, and comes back with its site, which doesn't report it again", async () => {
    const icon = iconIn(app.page.getByRole("tab").first());
    await go(`${site}/square`, /^Square/);
    await icon.waitFor();

    await go("about:blank");
    await until(async () => (await icon.count()) === 0, "the icon to go");

    await go(`${site}/square`);
    await icon.waitFor();
  });

  it("comes with a page on another site that links to it, which doesn't report it again", async () => {
    await iconIn(tab(/^Square/)).waitFor();
    await go(`${other}/elsewhere`, /^Elsewhere/);

    await iconIn(tab(/^Elsewhere/)).waitFor();
  });

  it("is asked for with its site's cookies only by that site's pages", async () => {
    await go(`${other}/mark`, /^Mark/);
    await iconIn(tab(/^Mark/)).waitFor();
    iconRequests.length = 0;

    await go(`${other}/elsewhere`, /^Elsewhere/);
    await iconIn(tab(/^Elsewhere/)).waitFor();
    await go(`${other}/mark`, /^Mark/);
    await iconIn(tab(/^Mark/)).waitFor();
    await go(`${site}/square`, /^Square/);
    await iconIn(tab(/^Square/)).waitFor();

    expect(iconRequests).toEqual([
      { url: `${site}/square.svg`, cookie: undefined },
      { url: `${other}/mark.svg`, cookie: undefined },
      { url: `${site}/square.svg`, cookie: "session=1" },
    ]);
  });

  it("shows on a tab only while its page is the tab's active pane, and on its pane's bar when collapsed", async () => {
    await app.page.getByRole("tab").nth(1).click();
    const splitTab = app.page.getByRole("tab", { selected: true });
    await app.page
      .locator('[data-node-id="Split-page-node"]')
      .getByPlaceholder("Search or enter address")
      .click();
    await iconIn(splitTab.filter({ hasText: /^Mark/ })).waitFor();

    await runCommand("Collapse Pane");

    await iconIn(bar()).waitFor();
    expect(await iconIn(bar()).getAttribute("data-page-icon")).toBe("template");
    await splitTab.filter({ hasNotText: /^Mark/ }).waitFor();
    expect(await iconIn(splitTab).count()).toBe(0);
  });

  it("still comes with a page that links to it after its tab has been away", async () => {
    await iconIn(tab(/^Square/)).waitFor();
    await showTab(1);
    await showTab(0);

    await go(`${other}/elsewhere`, /^Elsewhere/);
    await iconIn(tab(/^Elsewhere/)).waitFor();
  });

  it("shows once it loads, even while its tab is away", async () => {
    holdIcons = true;
    await go(`${other}/mark`, /^Mark/);
    await until(() => heldIcons.length > 0, "the icon to be asked for");
    await showTab(1);
    await app.page.evaluate(() => new Promise(requestAnimationFrame));
    answerHeldIcons();

    await iconIn(tab(/^Mark/)).waitFor();
  });

  it("follows its page to another site while its tab is away", async () => {
    await showTab(1);
    holdIcons = true;
    await go(`${site}/square`, /^Square/);
    await until(
      () => heldIcons.length > 0,
      "the next site's icon to be asked for",
    );
    await app.page.evaluate(() => new Promise(requestAnimationFrame));
    expect(await iconIn(tab(/^Square/)).count()).toBe(0);

    answerHeldIcons();
    const icon = iconIn(tab(/^Square/));
    await until(
      async () => (await icon.getAttribute("data-page-icon")) === "color",
      "the next site's icon to show",
    );
  });

  it("shows on a reopened tab before its page has loaded it", async () => {
    const pageTab = () => app.page.getByRole("tab").first();
    await pageTab().click();
    await iconIn(pageTab()).waitFor();
    await app.quit();

    holdIcons = true;
    app = await launch({ name: "browser-icon-reopened", home: app.home });

    await iconIn(pageTab()).waitFor();
    await app.page.getByRole("tab").nth(1).click();
    await iconIn(bar()).waitFor();
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});
