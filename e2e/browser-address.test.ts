import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, launch, type Terminal, until } from "./app";

describe("the browser's address bar", () => {
  let server: http.Server;
  let origin: string;
  let app: Conduit;
  let terminal: Terminal;

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      if (request.url === "/framed") {
        response.end(
          `<!doctype html><title>Framed</title><iframe src="/frame"></iframe>`,
        );
      } else {
        // A frame that moves within itself, as embedded players do
        response.end(`<!doctype html><script>location.hash = "moved"</script>`);
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
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

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});
