import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, launch, type Terminal } from "./app";

const page = `<!doctype html>
<title>E2E Page</title>
<input aria-label="Name">
<button onclick="document.querySelector('output').textContent = 'Hello, ' + document.querySelector('input').value">Greet</button>
<output></output>`;

interface Element {
  handle: string;
  text: string;
}

describe("browser automation from the CLI", () => {
  let server: http.Server;
  let url: string;
  let app: Conduit;
  let terminal: Terminal;

  beforeAll(async () => {
    server = http.createServer((_, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(page);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    app = await launch({ name: "browser" });
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

  it("opens a browser pane and navigates it", async () => {
    expect(await terminal.run("conduit split right -t browser")).toBe(0);
    expect(await terminal.run(`conduit browser-navigate ${url}`)).toBe(0);
    expect(await conduit("pane-list -t browser")).toEqual([
      expect.objectContaining({ type: "browser", url, title: "E2E Page" }),
    ]);
  });

  it("types into and clicks the page's elements", async () => {
    const [input] = await conduit<Element[]>("browser-query input");
    expect(await terminal.run(`conduit browser-type ${input.handle} Ada`)).toBe(
      0,
    );
    const [button] = await conduit<Element[]>("browser-query button");
    expect(button.text).toBe("Greet");
    expect(await terminal.run(`conduit browser-click ${button.handle}`)).toBe(
      0,
    );

    const output = await conduit<Element[]>(
      "browser-query output --text 'Hello, Ada' --timeout 5000",
    );
    expect(output.map((element) => element.text)).toEqual(["Hello, Ada"]);
  });

  it("finds elements by the role HTML gives them", async () => {
    const textboxes = await conduit<Element[]>("browser-query --role textbox");
    expect(textboxes.map((element) => element.text)).toEqual(["Ada"]);
    const buttons = await conduit<Element[]>("browser-query --role button");
    expect(buttons.map((element) => element.text)).toEqual(["Greet"]);
  });

  it("keeps quick open in the terminal's directory while the browser is focused", async () => {
    // Outside home, so falling back to the home directory finds nothing.
    const project = fs.mkdtempSync("/tmp/conduit-e2e-project-");
    try {
      fs.writeFileSync(path.join(project, "notes.txt"), "");
      await terminal.locator.click();
      expect(await terminal.run(`cd ${project}`)).toBe(0);
      const address = app.page.getByPlaceholder("Enter URL...");
      await address.click();
      await address.blur();

      await app.page.keyboard.press("Meta+p");
      await app.page.getByPlaceholder(/Search files by name/).fill("notes");
      await app.page.getByText("notes.txt").waitFor();
      await app.page.keyboard.press("Escape");
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});
