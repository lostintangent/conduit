import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Locator } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Conduit,
  launch,
  navigateInWebview,
  runCommand,
  until,
} from "./app";

/** A red square, which keeps its own color */
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#e11d48"/></svg>`;
/** A dark mark on a clear ground, like GitHub's, which takes its label's color */
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#24292f"/></svg>`;

const page = (title: string, icon?: string) =>
  `<!doctype html><title>${title}</title>${icon ? `<link rel="icon" href="${icon}">` : ""}`;

const files: Record<string, [type: string, body: string]> = {
  "/square": ["text/html", page("Square", "/square.svg")],
  "/mark": ["text/html", page("Mark", "/mark.svg")],
  "/also": ["text/html", page("Also", "/mark.svg")],
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
 * What a tab's label showed, in turn: what was in its icon's slot, and where
 * its title started.
 */
interface Shown {
  slots: string[];
  titleAt: number[];
}

declare global {
  interface Window {
    firstTab?: { shown: Shown; observer: MutationObserver };
  }
}

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
  /** What's in a label's icon slot: an icon, or a spinner while one loads */
  const slotIn = (locator: Locator) => locator.locator("[data-page-icon]");
  const iconIn = (locator: Locator) =>
    locator.locator('[data-page-icon]:not([data-page-icon="loading"])');
  const spinnerIn = (locator: Locator) =>
    locator.locator('[data-page-icon="loading"]');
  const bar = () => app.page.locator('[data-node-id="Split-page-node"] button');
  const pageWebview = () => app.page.locator("webview#Page-pane");

  /**
   * Watches the first tab's label from now on, through each change to it,
   * even one that doesn't last a frame. The returned function says what it
   * has shown since.
   */
  async function watchFirstTab() {
    await app.page.evaluate(() => {
      const tab = document.querySelector('[role="tab"]')!;
      const shown: Shown = { slots: [], titleAt: [] };
      const look = () => {
        const label = tab.firstElementChild!;
        const slot = label.querySelector("[data-page-icon]");
        const kind = slot?.getAttribute("data-page-icon") ?? "none";
        const titleAt = label.lastElementChild!.getBoundingClientRect().left;
        if (shown.slots.at(-1) !== kind) shown.slots.push(kind);
        if (shown.titleAt.at(-1) !== titleAt) shown.titleAt.push(titleAt);
      };
      look();
      window.firstTab?.observer.disconnect();
      const observer = new MutationObserver(look);
      observer.observe(tab, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      window.firstTab = { shown, observer };
    });
    return () => app.page.evaluate(() => window.firstTab!.shown);
  }

  /** Reloads the first tab's page, and waits for it to stop loading */
  const reload = () =>
    pageWebview().evaluate(
      (webview: Electron.WebviewTag) =>
        new Promise<void>((resolve) => {
          const stopped = () => {
            webview.removeEventListener("did-stop-loading", stopped);
            resolve();
          };
          webview.addEventListener("did-stop-loading", stopped);
          webview.reload();
        }),
    );

  /** How many animations are running in a tab, a spinner's included */
  const animationsIn = (locator: Locator) =>
    locator.evaluate(
      (element) => element.getAnimations({ subtree: true }).length,
    );

  /**
   * Goes to `url` in the first tab's page, and waits for it to get there, and
   * for its tab to say `label`.
   */
  async function go(url: string, label?: RegExp) {
    const webview = pageWebview();
    await navigateInWebview(webview, url);
    await until(
      async () =>
        (await webview.evaluate((webview: Electron.WebviewTag) =>
          webview.getURL(),
        )) === url,
      `the page to go to ${url}`,
    );
    if (label) await tab(label).waitFor();
  }

  it("shows before the page's title on its tab", async () => {
    const icon = iconIn(tab(/^Square/));
    await icon.waitFor();

    expect(await icon.getAttribute("data-page-icon")).toBe("color");
    expect(
      await icon.evaluate((icon) => icon.nextElementSibling?.textContent),
    ).toBe("Square");
  });

  it("shows before its tab's name too, but not while the tab is being renamed", async () => {
    const pageTab = app.page.getByRole("tab").first();
    const rename = async (name: string) => {
      await pageTab.locator(":scope > span:first-child").dblclick();
      await pageTab.locator("input").fill(name);
      expect(await slotIn(pageTab).count()).toBe(0);
      await app.page.keyboard.press("Enter");
    };
    await iconIn(tab(/^Square/)).waitFor();

    await rename("Docs");

    const icon = iconIn(tab(/^Docs/));
    await icon.waitFor();
    expect(
      await icon.evaluate((icon) => icon.nextElementSibling?.textContent),
    ).toBe("Docs");

    // Without a name, the page's title labels the tab again
    await rename("");
    await iconIn(tab(/^Square/)).waitFor();
  });

  it("leaves with its site, for a spinner that holds its place while the next site's icon loads", async () => {
    await iconIn(tab(/^Square/)).waitFor();
    const shown = await watchFirstTab();
    holdIcons = true;
    await go(`${other}/mark`, /^Mark/);
    await until(
      () => heldIcons.length > 0,
      "the next site's icon to be asked for",
    );
    await spinnerIn(tab(/^Mark/)).waitFor();
    expect(await animationsIn(tab(/^Mark/))).toBe(1);

    answerHeldIcons();
    await iconIn(tab(/^Mark/)).waitFor();

    expect(await shown()).toEqual({
      slots: ["color", "loading", "template"],
      titleAt: [expect.any(Number)],
    });
    expect(await animationsIn(tab(/^Mark/))).toBe(0);
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

  it("stays, without a spinner, while its site's next page loads, or its page reloads", async () => {
    await iconIn(tab(/^Mark/)).waitFor();
    const shown = await watchFirstTab();

    await go(`${other}/also`, /^Also/);
    await reload();
    await iconIn(tab(/^Also/)).waitFor();

    expect(await shown()).toEqual({
      slots: ["template"],
      titleAt: [expect.any(Number)],
    });
  });

  it("goes when the site's next page has none, which leaves no spinner when it reloads", async () => {
    await iconIn(tab(/^Also/)).waitFor();
    await go(`${other}/plain`, /^Plain/);
    await until(
      async () => (await slotIn(tab(/^Plain/)).count()) === 0,
      "the mark to go",
    );
    const shown = await watchFirstTab();

    await reload();

    expect((await shown()).slots).toEqual(["none"]);
  });

  it("gives way to a spinner that goes when a new site's page has none, or doesn't load", async () => {
    const closed = http.createServer();
    await new Promise<void>((resolve) =>
      closed.listen(0, "127.0.0.1", resolve),
    );
    const nowhere = `http://127.0.0.1:${(closed.address() as AddressInfo).port}/`;
    await new Promise((resolve) => closed.close(resolve));

    for (const url of [`${other}/plain`, nowhere]) {
      await go(`${site}/square`, /^Square/);
      await iconIn(tab(/^Square/)).waitFor();
      const shown = await watchFirstTab();

      await go(url);
      const slot = slotIn(app.page.getByRole("tab").first());
      await until(async () => (await slot.count()) === 0, "the spinner to go");

      expect((await shown()).slots).toEqual(["color", "loading", "none"]);
    }
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

    await runCommand(app.page, "Collapse Pane");

    await iconIn(bar()).waitFor();
    expect(await iconIn(bar()).getAttribute("data-page-icon")).toBe("template");
    await splitTab.filter({ hasNotText: /^Mark/ }).waitFor();
    expect(await slotIn(splitTab).count()).toBe(0);
  });

  it("gives way to a spinner on its pane's bar too, while a new site's loads", async () => {
    holdIcons = true;
    await navigateInWebview(
      app.page.locator("webview#Split-page"),
      `${other}/square`,
    );

    await spinnerIn(bar()).waitFor();
    answerHeldIcons();
    await until(
      async () =>
        (await iconIn(bar()).getAttribute("data-page-icon")) === "color",
      "the next site's icon to show on the bar",
    );
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
    await spinnerIn(tab(/^Square/)).waitFor();

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
