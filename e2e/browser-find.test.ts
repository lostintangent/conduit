import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, launch, type Terminal, until } from "./app";

describe("find in a browser page", () => {
  let server: http.Server;
  let origin: string;
  let app: Conduit;
  let terminal: Terminal;

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      if (request.url === "/own-find") {
        // Like a document editor, which has its own find
        response.end(`<!doctype html><title>Own Find</title><p>cat</p>
<script>
  window.found = 0;
  addEventListener("keydown", (event) => {
    if (event.metaKey && event.key === "f") {
      event.preventDefault();
      window.found++;
    }
  });
</script>`);
      } else {
        response.end(
          `<!doctype html><title>Pets</title><p>cat one</p><p>dog</p><p>cat two</p><p>cat three</p>`,
        );
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    app = await launch({ name: "browser-find" });
    terminal = await app.terminal();
  });

  afterAll(async () => {
    await app?.close();
    server?.close();
  });

  const webview = () => app.page.locator("webview").first();
  const findBar = () => app.page.getByRole("search");
  const count = () => findBar().getByRole("status");

  /** Runs a script in the page, returning what it evaluates to. */
  function inPage<T>(script: string): Promise<T> {
    return webview().evaluate(
      (webview: Electron.WebviewTag, code) => webview.executeJavaScript(code),
      script,
    );
  }

  /** Loads the page at the path, once its title says it's there. */
  async function open(path: string, title: string) {
    await inPage(`location.href = ${JSON.stringify(origin + path)}`);
    await until(
      () => inPage<boolean>(`document.title === ${JSON.stringify(title)}`),
      `${path} to load`,
    );
  }

  /**
   * Clicks the start of the element in the page until the page has focus and
   * has drawn, so keys reach it.
   */
  function focusPage(selector = "p") {
    return until(async () => {
      const box = (await webview().boundingBox())!;
      const { x, y } = await inPage<{ x: number; y: number }>(
        `(() => { const { x, y, height } = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: x + 1, y: y + height / 2 }; })()`,
      );
      await app.page.mouse.click(box.x + x, box.y + y);
      return inPage<boolean>(
        "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(document.hasFocus()))))",
      );
    }, "the page to take focus");
  }

  /** The find field's text, if it has focus, with what's selected marked. */
  function focusedField(): Promise<string | null> {
    return app.page.evaluate(() => {
      const input = document.activeElement as HTMLInputElement | null;
      if (input?.placeholder !== "Find in page") return null;
      const { value, selectionStart: start, selectionEnd: end } = input;
      return start === end
        ? value
        : `${value.slice(0, start!)}[${value.slice(start!, end!)}]${value.slice(end!)}`;
    });
  }

  async function expectCount(expected: string) {
    await until(async () => {
      const actual = await count().textContent();
      if (actual !== expected) throw new Error(`it counts "${actual}"`);
      return true;
    }, `find to count ${expected}`);
  }

  it("finds as the user types, from a bar over the page's corner", async () => {
    expect(await terminal.run("conduit split right -t browser")).toBe(0);
    await until(() => webview().isVisible(), "the browser pane");
    await open("/", "Pets");
    await focusPage();
    const page = await webview().boundingBox();

    await app.page.keyboard.press("Meta+f");
    await until(async () => (await focusedField()) === "", "find to focus");
    await app.page.keyboard.type("cat");
    await expectCount("1 of 3");

    // It floats over the page, which keeps its size
    const bar = (await findBar().boundingBox())!;
    expect(Math.abs(bar.y - (page!.y + 8))).toBeLessThanOrEqual(1);
    expect(
      Math.abs(bar.x + bar.width - (page!.x + page!.width - 8)),
    ).toBeLessThanOrEqual(1);
    expect(await webview().boundingBox()).toEqual(page);

    await app.page.keyboard.type("x");
    await expectCount("Not found");
    await app.page.keyboard.press("Backspace");
    await expectCount("1 of 3");
  });

  it("goes through the matches with Enter and Cmd+G, and back with Shift", async () => {
    await app.page.keyboard.press("Enter");
    await expectCount("2 of 3");
    await app.page.keyboard.press("Enter");
    await expectCount("3 of 3");
    await app.page.keyboard.press("Enter");
    await expectCount("1 of 3");
    await app.page.keyboard.press("Shift+Enter");
    await expectCount("3 of 3");
    await app.page.keyboard.press("Meta+g");
    await expectCount("1 of 3");
    await app.page.keyboard.press("Meta+Shift+g");
    await expectCount("3 of 3");
    await findBar().getByRole("button", { name: "Next" }).click();
    await expectCount("1 of 3");
    // Which leaves the field focused
    expect(await focusedField()).toBe("cat");
  });

  it("closes with Escape, leaving the page focused on its match", async () => {
    await app.page.keyboard.press("Escape");

    await findBar().waitFor({ state: "hidden" });
    await until(
      () => inPage<boolean>("document.hasFocus()"),
      "the page to take focus",
    );
    expect(await inPage("getSelection().toString()")).toBe("cat");
    // And the page has the keys
    await app.page.keyboard.press("Meta+f");
    await until(
      async () => (await focusedField()) === "[cat]",
      "find to open with its text selected",
    );
    // Finding goes on from the match the page kept
    await app.page.keyboard.press("Enter");
    await expectCount("2 of 3");
  });

  it("goes to the next match from the page, leaving it focused", async () => {
    await app.page.keyboard.press("Enter");
    await expectCount("3 of 3");
    // From where the user clicked, which is past the first match
    await focusPage("p:nth-of-type(2)");

    await app.page.keyboard.press("Meta+g");

    await expectCount("2 of 3");
    expect(await inPage("document.hasFocus()")).toBe(true);
    expect(await focusedField()).toBeNull();
  });

  it("closes when its page goes to another page", async () => {
    await open("/own-find", "Own Find");

    await findBar().waitFor({ state: "hidden" });
  });

  it("leaves Cmd+F to a page with its own find", async () => {
    await focusPage();

    await app.page.keyboard.press("Meta+f");
    await until(() => inPage<boolean>("window.found === 1"), "the page's find");
    // Keys the app takes reach it in order, so the address bar takes focus
    // after find would have
    await app.page.keyboard.press("Meta+l");
    await until(
      () =>
        app.page.evaluate(
          () =>
            (document.activeElement as HTMLInputElement | null)?.placeholder ===
            "Search or enter address",
        ),
      "the address bar to take focus",
    );

    expect(await findBar().count()).toBe(0);
  });
});
