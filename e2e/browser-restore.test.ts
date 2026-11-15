import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, launch, until } from "./app";

const pages: Record<string, string> = {
  "/first": "<!doctype html><title>First</title>",
  "/second": `<!doctype html>
<title>Second</title>
<input id="note">
<div style="height: 6000px"></div>`,
};

describe("a page reopened at launch", () => {
  let server: http.Server;
  let origin: string;
  let app: Conduit;
  const requested: string[] = [];

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      if (request.url !== "/favicon.ico") requested.push(request.url!);
      response.writeHead(200, { "content-type": "text/html" });
      response.end(pages[request.url!] ?? "");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    app = await launch({ name: "browser-restore" });
  });

  afterAll(async () => {
    await app?.close();
    server?.close();
  });

  /** Runs a script in the page, returning what it evaluates to. */
  function inPage<T>(script: string): Promise<T> {
    return app.page
      .locator("webview")
      .first()
      .evaluate(
        (webview: Electron.WebviewTag, code) => webview.executeJavaScript(code),
        script,
      );
  }

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
