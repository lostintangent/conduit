import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, inWebview, launch, type Terminal, until } from "./app";

describe("the browser's address bar", () => {
  let server: http.Server;
  let origin: string;
  let app: Conduit;
  let terminal: Terminal;

  const servePage: http.RequestListener = (request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    if (request.url === "/framed") {
      response.end(
        `<!doctype html><title>Framed</title><iframe src="/frame"></iframe>`,
      );
    } else if (request.url === "/frame") {
      // A frame that moves within itself, as embedded players do
      response.end(`<!doctype html><script>location.hash = "moved"</script>`);
    } else if (request.url === "/field") {
      // Like a search page, which focuses its field for the user
      response.end(`<!doctype html><title>Field</title><input autofocus>`);
    } else {
      response.end(`<!doctype html><title>Page</title>`);
    }
  };

  /** Starts a server for the pages, on the port if it's given. */
  async function startServer(port = 0) {
    const started = http.createServer(servePage);
    await new Promise<void>((resolve) =>
      started.listen(port, "127.0.0.1", resolve),
    );
    return started;
  }

  beforeAll(async () => {
    server = await startServer();
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    app = await launch({ name: "browser-address" });
    terminal = await app.terminal();
  });

  afterAll(async () => {
    await app?.close();
    server?.close();
  });

  /** Runs a conduit command and parses what it printed as JSON. */
  async function conduit<T>(args: string): Promise<T> {
    expect(await terminal.run(`conduit ${args} > ~/cli.json`)).toBe(0);
    return JSON.parse(
      fs.readFileSync(path.join(app.home, "cli.json"), "utf8"),
    ) as T;
  }

  const webview = () => app.page.locator("webview").first();
  const address = () => app.page.getByPlaceholder("Search or enter address");

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

  it("keeps the page's address when a frame in it moves", async () => {
    expect(await terminal.run("conduit split right -t browser")).toBe(0);
    await waitForPageEvent("did-navigate-in-page", async () => {
      expect(
        await terminal.run(`conduit browser-navigate ${origin}/framed`),
      ).toBe(0);
    });
    // Once the app has drawn what the event changed
    await app.page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(resolve)),
    );

    expect(await address().inputValue()).toBe(`${origin}/framed`);
    expect(await conduit("pane-list -t browser")).toEqual([
      expect.objectContaining({ url: `${origin}/framed` }),
    ]);
  });

  const back = () => app.page.getByRole("button", { name: "Back" });
  const headline = () => app.page.getByRole("heading");

  it("says why a page didn't load in its place, and keeps the address", async () => {
    await waitForPageEvent("did-fail-load", async () => {
      await address().click();
      await address().fill("conduit-e2e.invalid");
      await address().press("Enter");
    });

    await expect(headline().textContent()).resolves.toBe(
      "Can't Find the Server",
    );
    await app.page
      .getByText("Conduit can't find conduit-e2e.invalid.")
      .waitFor();
    await app.page.getByText("ERR_NAME_NOT_RESOLVED").waitFor();
    expect(await address().inputValue()).toBe("conduit-e2e.invalid/");
    expect(await back().isEnabled()).toBe(true);
  });

  it("goes back from a page that didn't load", async () => {
    await waitForPageEvent("did-navigate", () => back().click());

    await headline().waitFor({ state: "detached" });
    expect(await address().inputValue()).toBe(`${origin}/framed`);
  });

  /** A port that nothing answers on, until a test starts a server there */
  async function deadPort() {
    const dead = await startServer();
    const { port } = dead.address() as AddressInfo;
    await new Promise((resolve) => dead.close(resolve));
    return port;
  }

  it("tries a page again once something answers at its address, and gives it the keys back", async () => {
    // Like a dev server that hasn't started yet
    const port = await deadPort();
    await waitForPageEvent("did-fail-load", async () => {
      await address().click();
      await address().fill(`127.0.0.1:${port}/page`);
      await address().press("Enter");
    });
    await expect(headline().textContent()).resolves.toBe(
      "Can't Connect to the Server",
    );
    await app.page
      .getByText(`Conduit can't connect to 127.0.0.1:${port}.`)
      .waitFor();

    const revived = await startServer(port);
    try {
      await waitForPageEvent("did-navigate", () =>
        app.page.getByRole("button", { name: "Try Again" }).click(),
      );

      await headline().waitFor({ state: "detached" });
      expect(
        await webview().evaluate(
          (webview: HTMLElement) => getComputedStyle(webview).visibility,
        ),
      ).toBe("visible");
      const hasKeys = (tag: string) => async () =>
        (await app.page.evaluate(() => document.activeElement?.tagName)) ===
        tag;
      expect(await hasKeys("WEBVIEW")()).toBe(true);
      // And keeps them as the user moves away from its pane and back
      await app.page.keyboard.press("Meta+Alt+ArrowLeft");
      await until(hasKeys("TEXTAREA"), "the terminal to have the keys");
      await app.page.keyboard.press("Meta+Alt+ArrowRight");
      await until(hasKeys("WEBVIEW"), "the page to have the keys again");
      expect(await conduit("pane-list -t browser")).toEqual([
        expect.objectContaining({ url: `http://127.0.0.1:${port}/page` }),
      ]);
    } finally {
      revived.close();
    }
  });

  it("says why a page the CLI opened didn't load", async () => {
    const port = await deadPort();
    await waitForPageEvent("did-fail-load", async () => {
      expect(
        await terminal.run(`conduit browser-navigate 127.0.0.1:${port}`),
      ).toBe(0);
    });

    await app.page
      .getByText(`Conduit can't connect to 127.0.0.1:${port}.`)
      .waitFor();
  });

  const typedInPage = () =>
    inWebview(webview(), "document.querySelector('input')?.value");
  const appFocus = () =>
    app.page.evaluate(() => document.activeElement?.tagName);
  const pageFocusedItsField = () =>
    inWebview(webview(), "document.activeElement?.tagName === 'INPUT'");

  it("gives the keys to the page it goes to on Enter, from a page that didn't load or another site's page", async () => {
    // Each on another site than the last, so another process has the page
    for (const [place, typed] of [
      [origin.replace("127.0.0.1", "localhost"), "hello"],
      [origin, "again"],
    ]) {
      await waitForPageEvent("did-navigate", async () => {
        await address().click();
        await address().fill(`${place.slice("http://".length)}/field`);
        await address().press("Enter");
      });
      // Keys typed before the page has its field are lost, as in any browser
      await until(pageFocusedItsField, "the page to focus its field");

      await app.page.keyboard.type(typed);
      await until(
        async () => (await typedInPage()) === typed,
        "the keys to reach the page",
      );
      expect(await appFocus()).toBe("WEBVIEW");
      expect(await address().inputValue()).toBe(`${place}/field`);
    }
  });

  it("puts the page's address back on the first Escape, and gives the page the keys on the second", async () => {
    await address().click();
    await address().fill("foo");

    await app.page.keyboard.press("Escape");
    expect(
      await address().evaluate((field: HTMLInputElement) => [
        field === document.activeElement,
        field.value,
        field.selectionStart,
        field.selectionEnd,
      ]),
    ).toEqual([true, `${origin}/field`, 0, `${origin}/field`.length]);

    await app.page.keyboard.press("Escape");
    await app.page.keyboard.type("!");
    await until(
      async () => (await typedInPage()) === "again!",
      "the keys to reach the page",
    );
    expect(await address().inputValue()).toBe(`${origin}/field`);
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});
