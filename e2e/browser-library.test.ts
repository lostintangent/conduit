import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, inWebview, launch, type Terminal, until } from "./app";

describe("the browser's history and favorites", () => {
  let server: http.Server;
  let origin: string;
  /** An address nothing answers at, whose page fails to load */
  let deadUrl: string;
  let app: Conduit;
  let terminal: Terminal;

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      const name = request.url!.slice(1);
      response.end(
        `<!doctype html><title>${name}</title><a href="/two">Two</a>`,
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const dead = http.createServer();
    await new Promise<void>((resolve) => dead.listen(0, "127.0.0.1", resolve));
    deadUrl = `http://127.0.0.1:${(dead.address() as AddressInfo).port}/`;
    await new Promise((resolve) => dead.close(resolve));

    app = await launch({
      name: "browser-library",
      // What an older Conduit kept in settings.json
      settings: {
        theme: "light",
        urlHistory: [`${origin}/typed`],
        starredPages: [{ url: `${origin}/starred`, title: "Starred" }],
      },
    });
    terminal = await app.terminal();
  });

  afterAll(async () => {
    await app?.close();
    server?.close();
  });

  const readConduitFile = (name: string) =>
    JSON.parse(fs.readFileSync(path.join(app.home, ".conduit", name), "utf8"));

  const webview = () => app.page.locator("webview").first();

  /** Runs a script in the page, returning what it evaluates to. */
  function inPage<T>(script: string): Promise<T> {
    return inWebview(webview(), script);
  }

  /** Waits for the page to fire the event, once a test has started it. */
  async function waitForPageEvent(event: string, start: () => Promise<void>) {
    await webview().evaluate((webview: Electron.WebviewTag, event) => {
      webview.dataset.fired = "false";
      const fired = () => (webview.dataset.fired = "true");
      (webview as HTMLElement).addEventListener(event, fired, { once: true });
    }, event);
    await start();
    await until(
      () =>
        webview().evaluate(
          (webview: Electron.WebviewTag) => webview.dataset.fired === "true",
        ),
      `the page's ${event}`,
    );
  }

  /**
   * The addresses the address bar suggests once it's emptied, favorites
   * first. It leaves the field, so the next look starts from the page's
   * address again.
   */
  async function suggestions(): Promise<string[]> {
    const address = app.page.getByPlaceholder("Search or enter address");
    await address.click();
    await address.fill("");
    // A list that's closing stays in the page until it has faded out
    const urls = await app.page
      .locator("[data-radix-popper-content-wrapper] > [data-state=open]")
      .getByRole("option")
      .evaluateAll((options) =>
        options.map((option) => option.lastElementChild!.textContent!),
      );
    await address.blur();
    return urls;
  }

  it("moves history and favorites out of settings.json", () => {
    expect(readConduitFile("browser.json")).toEqual({
      favorites: [{ url: `${origin}/starred`, title: "Starred" }],
      history: [
        {
          url: `${origin}/typed`,
          title: `${origin}/typed`,
          visitedAt: expect.any(Number),
        },
      ],
    });
    expect(readConduitFile("settings.json")).toEqual({ theme: "light" });
  });

  /** Waits for the address bar to suggest these addresses, in this order. */
  async function expectSuggestions(urls: string[]) {
    let shown: string[] = [];
    const matches = async () => {
      shown = await suggestions();
      return JSON.stringify(shown) === JSON.stringify(urls);
    };
    await until(matches, "the address bar's suggestions").catch(() => {});
    expect(shown).toEqual(urls);
  }

  it("records the pages the user visits", async () => {
    expect(await terminal.run("conduit split right -t browser")).toBe(0);
    await waitForPageEvent("did-stop-loading", async () => {
      expect(await terminal.run(`conduit browser-navigate ${origin}/one`)).toBe(
        0,
      );
    });
    await waitForPageEvent("did-stop-loading", () =>
      inPage("document.querySelector('a').click()"),
    );

    await expectSuggestions([
      `${origin}/starred`,
      `${origin}/two`,
      `${origin}/one`,
      `${origin}/typed`,
    ]);
    await until(
      () => readConduitFile("browser.json").history.length === 3,
      "the visits to save",
    );
    expect(readConduitFile("browser.json").history).toMatchObject([
      { url: `${origin}/two`, title: "two" },
      { url: `${origin}/one`, title: "one" },
      { url: `${origin}/typed` },
    ]);
  });

  it("stars the page", async () => {
    await app.page.getByRole("button", { name: "Star this page" }).click();

    await app.page.getByRole("button", { name: "Unstar this page" }).waitFor();
    expect(readConduitFile("browser.json").favorites).toEqual([
      { url: `${origin}/two`, title: "two" },
      { url: `${origin}/starred`, title: "Starred" },
    ]);
  });

  it("leaves a page that fails to load out of history", async () => {
    await waitForPageEvent("did-fail-load", () =>
      inPage(`location.href = ${JSON.stringify(deadUrl)}`),
    );
    await waitForPageEvent("did-stop-loading", async () => {
      expect(
        await terminal.run(`conduit browser-navigate ${origin}/three`),
      ).toBe(0);
    });

    await expectSuggestions([
      `${origin}/two`,
      `${origin}/starred`,
      `${origin}/three`,
      `${origin}/one`,
      `${origin}/typed`,
    ]);
  });

  it("clears history from the page's menu, and keeps favorites", async () => {
    await app.page.getByRole("button", { name: "More options" }).click();
    await app.page.getByRole("menuitem", { name: "Clear history…" }).click();
    await app.page.getByRole("button", { name: "Clear" }).click();

    await expectSuggestions([`${origin}/two`, `${origin}/starred`]);
    expect(readConduitFile("browser.json")).toMatchObject({
      favorites: [{ url: `${origin}/two` }, { url: `${origin}/starred` }],
      history: [],
    });
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});
