import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, inWebview, launch, type Terminal, until } from "./app";

const REPORT = "a,b\n1,2\n";
const BIG = 1_000_000;

describe("a page's downloads", () => {
  let server: http.Server;
  let origin: string;
  let app: Conduit;
  let terminal: Terminal;
  // Big downloads stop at 42% until the test lets them finish
  const held: http.ServerResponse[] = [];

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      const name = request.url!.slice(1);
      const attachment = {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${name}"`,
      };
      if (request.url === "/report.csv") {
        response.writeHead(200, attachment);
        response.end(REPORT);
      } else if (request.url === "/big.zip") {
        response.writeHead(200, { ...attachment, "content-length": BIG });
        response.write(Buffer.alloc(BIG * 0.42));
        held.push(response);
      } else if (request.url === "/broken.zip") {
        // Resumable, so Chromium keeps the partial file once it stops retrying
        response.writeHead(200, {
          ...attachment,
          "content-length": 1000,
          "accept-ranges": "bytes",
          etag: '"broken"',
        });
        response.write(Buffer.alloc(100));
        setTimeout(() => response.socket?.destroy(), 200);
      } else {
        response.writeHead(200, { "content-type": "text/html" });
        response.end(`<!doctype html>
<title>Downloads</title>
<a id="report" href="/report.csv">Report</a>
<a id="big" href="/big.zip">Big</a>
<a id="broken" href="/broken.zip">Broken</a>`);
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    app = await launch({
      name: "browser-downloads",
      files: { "Downloads/report.csv": "an older report" },
    });
    terminal = await app.terminal();
  });

  afterAll(async () => {
    for (const response of held) response.destroy();
    await app?.close();
    server?.close();
  });

  const downloads = () => path.join(app.home, "Downloads");

  /** Runs a script in the page, returning what it evaluates to. */
  function inPage<T>(script: string): Promise<T> {
    return inWebview(app.page.locator("webview").first(), script);
  }

  /** Follows one of the page's links, as a click would. */
  function follow(id: string) {
    return inPage(`document.getElementById(${JSON.stringify(id)}).click()`);
  }

  /** The toast with this message, once it shows. */
  async function toast(message: string) {
    const card = app.page.locator(".pointer-events-auto", {
      has: app.page.getByText(message, { exact: true }),
    });
    await until(() => card.isVisible(), `the toast "${message}"`);
    return card;
  }

  it("opens a page with downloads", async () => {
    expect(await terminal.run("conduit split right -t browser")).toBe(0);
    expect(await terminal.run(`conduit browser-navigate ${origin}/`)).toBe(0);
    await until(
      () => inPage("document.title === 'Downloads'"),
      "the downloads page",
    );
  });

  it("saves a download straight to Downloads, beside a file with its name", async () => {
    await follow("report");

    const card = await toast("Downloaded report 2.csv");
    expect(await card.textContent()).toContain("In Downloads");
    expect(
      await card.getByRole("button", { name: "Show in Finder" }).isVisible(),
    ).toBe(true);
    expect(
      fs.readFileSync(path.join(downloads(), "report 2.csv"), "utf8"),
    ).toBe(REPORT);
    expect(fs.readFileSync(path.join(downloads(), "report.csv"), "utf8")).toBe(
      "an older report",
    );
  });

  it("shows two long downloads' progress until they're done", async () => {
    await follow("big");
    await follow("big");

    for (const name of ["big.zip", "big 2.zip"]) {
      const card = await toast(`Downloading ${name}…`);
      await until(
        async () => (await card.textContent())?.includes("42%"),
        `${name} at 42%`,
      );
    }

    for (const response of held.splice(0)) {
      response.end(Buffer.alloc(BIG * 0.58));
    }
    for (const name of ["big.zip", "big 2.zip"]) {
      await toast(`Downloaded ${name}`);
      expect(fs.statSync(path.join(downloads(), name)).size).toBe(BIG);
    }
    expect(await app.page.getByText(/^Downloading/).count()).toBe(0);
  });

  it("says when a download fails, and leaves no partial file", async () => {
    await follow("broken");

    const card = await toast("Couldn't download broken.zip");
    await until(
      () => !fs.existsSync(path.join(downloads(), "broken.zip")),
      "the partial broken.zip to go",
    );
    expect(fs.readdirSync(downloads()).sort()).toEqual([
      "big 2.zip",
      "big.zip",
      "report 2.csv",
      "report.csv",
    ]);
    expect(await card.isVisible()).toBe(true);
    expect(await app.page.getByText(/^Downloading/).count()).toBe(0);
  });
});
