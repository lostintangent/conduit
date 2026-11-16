import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, inWebview, launch, until } from "./app";

describe("a page's cookies", () => {
  let server: http.Server;
  let origin: string;
  let app: Conduit;

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      response.writeHead(200, {
        "content-type": "text/html",
        ...(request.url === "/sign-in" && {
          "set-cookie": "signed-in=yes; Path=/; Max-Age=86400",
        }),
      });
      response.end("<!doctype html><title>Cookies</title>");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    app = await launch({ name: "browser-cookies" });
  });

  afterAll(async () => {
    await app?.close();
    server?.close();
  });

  /** Opens a browser pane at this path, and returns what its page's script evaluates to. */
  async function openAndRun<T>(pathname: string, script: string): Promise<T> {
    const terminal = await app.terminal();
    expect(await terminal.run("conduit split right -t browser")).toBe(0);
    expect(
      await terminal.run(`conduit browser-navigate ${origin}${pathname}`),
    ).toBe(0);
    const webview = app.page.locator("webview").last();
    const run = (code: string) => inWebview(webview, code);
    await until(
      () => run(`location.pathname === ${JSON.stringify(pathname)}`),
      `the page at ${pathname}`,
    );
    return run(script) as Promise<T>;
  }

  /** Whether the browser's cookie files on disk mention this name. */
  function savedCookie(name: string) {
    const folder = path.join(app.home, "ud", "Partitions", "browser");
    return fs
      .readdirSync(folder)
      .filter((file) => file.startsWith("Cookies"))
      .some((file) => fs.readFileSync(path.join(folder, file)).includes(name));
  }

  it("keeps a site's sign-in when Conduit quits unexpectedly", async () => {
    expect(await openAndRun("/sign-in", "document.cookie")).toBe(
      "signed-in=yes",
    );
    // Chromium saves cookies every 30 seconds on its own, so a crash before
    // then would sign the user out.
    await until(() => savedCookie("signed-in"), "the cookie saved to disk");

    await app.crash();
    app = await launch({ name: "browser-cookies-again", home: app.home });

    expect(await openAndRun("/", "document.cookie")).toBe("signed-in=yes");
  });
});
