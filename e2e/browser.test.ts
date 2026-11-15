import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, launch, type Terminal, until } from "./app";

const page = `<!doctype html>
<title>E2E Page</title>
<input aria-label="Name">
<button onclick="document.querySelector('output').textContent = 'Hello, ' + document.querySelector('input').value">Greet</button>
<output></output>`;

interface Element {
  handle: string;
  text: string;
}

interface Pane {
  id: string;
  url: string;
}

describe("browser automation from the CLI", () => {
  let server: http.Server;
  let url: string;
  let app: Conduit;
  let terminal: Terminal;
  /** The paths the page has requested, e.g. to tell a test it's ready. */
  const requested: string[] = [];

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      requested.push(request.url!);
      response.writeHead(200, { "content-type": "text/html" });
      response.end(page);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    app = await launch({
      name: "browser",
      // Outlines the active pane, so a test can see which one it is
      settings: { alwaysHighlightActivePane: true },
    });
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

  /** The active pane's address, or "terminal" when a terminal is active. */
  function activePane(): Promise<string> {
    return app.page.evaluate(() => {
      const outline = document.querySelector('[class*="shadow-[inset"]');
      const pane = outline?.parentElement;
      if (pane?.querySelector(".xterm")) return "terminal";
      const address = pane?.querySelector<HTMLInputElement>(
        'input[placeholder="Enter URL..."]',
      );
      return address?.value ?? "none";
    });
  }

  async function expectActivePane(expected: string) {
    await until(async () => {
      const active = await activePane();
      if (active !== expected) throw new Error(`${active} is active`);
      return true;
    }, `${expected} to be the active pane`);
  }

  /** Clicks the middle of the nth webview's page, in the order they opened. */
  async function clickPage(index: number) {
    const box = await app.page.locator("webview").nth(index).boundingBox();
    await app.page.mouse.click(
      box!.x + box!.width / 2,
      box!.y + box!.height / 2,
    );
  }

  /** Runs a script in the nth webview's page, returning what it evaluates to. */
  function inPage<T>(index: number, script: string): Promise<T> {
    return app.page
      .locator("webview")
      .nth(index)
      .evaluate(
        (webview: Electron.WebviewTag, code) => webview.executeJavaScript(code),
        script,
      );
  }

  /** The focused address bar's address, once all of it is selected. */
  function selectedAddress(): Promise<string | null> {
    return app.page.evaluate(() => {
      const input = document.activeElement as HTMLInputElement | null;
      if (input?.placeholder !== "Enter URL...") return null;
      const all =
        input.selectionStart === 0 && input.selectionEnd === input.value.length;
      return all ? input.value : null;
    });
  }

  /** How many address bars show the given address. */
  function addressBars(address: string): Promise<number> {
    return app.page
      .getByPlaceholder("Enter URL...")
      .evaluateAll(
        (inputs, address) =>
          inputs.filter(
            (input) => (input as HTMLInputElement).value === address,
          ).length,
        address,
      );
  }

  async function focusPage(index: number) {
    await clickPage(index);
    await until(
      () => inPage(index, "document.hasFocus()"),
      "the page to take focus",
    );
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

  /** The nth tab, once it's the selected one. */
  function selectedTab(index: number) {
    return app.page
      .getByRole("tab")
      .nth(index)
      .and(app.page.getByRole("tab", { selected: true }));
  }

  it("opens a browser pane and navigates it", async () => {
    expect(await terminal.run("conduit split right -t browser")).toBe(0);
    expect(await terminal.run(`conduit browser-navigate ${url}`)).toBe(0);
    // browser-navigate returns before the page loads, so wait for its title
    await until(async () => {
      const [pane] = await conduit<{ title?: string }[]>(
        "pane-list -t browser",
      );
      return pane?.title === "E2E Page";
    }, "the page's title");
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

  it("saves a screenshot of the page", async () => {
    expect(await terminal.run("conduit browser-capture > ~/capture.txt")).toBe(
      0,
    );
    const output = fs.readFileSync(path.join(app.home, "capture.txt"), "utf8");
    const file = output.match(/^Screenshot saved to: (.+\.png)$/m)![1];
    const png = fs.readFileSync(file);
    fs.rmSync(file);

    // The PNG signature, then the header's width and height
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBeGreaterThan(0);
    expect(png.readUInt32BE(20)).toBeGreaterThan(0);
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

  it("activates a browser pane when its page is clicked", async () => {
    await terminal.locator.click();
    await expectActivePane("terminal");

    await clickPage(0);
    await expectActivePane(url);
  });

  // Focus moving between two webviews fires no event in the window at all.
  it("activates the pane of whichever page is clicked", async () => {
    const second = `${url}second`;
    await terminal.locator.click();
    expect(await terminal.run("conduit split bottom -t browser")).toBe(0);
    const panes = await conduit<Pane[]>("pane-list -t browser");
    const pane = panes.find((candidate) => candidate.url !== url);
    expect(
      await terminal.run(`conduit browser-navigate -p ${pane!.id} ${second}`),
    ).toBe(0);
    await until(
      () =>
        app.page
          .locator("webview")
          .nth(1)
          .evaluate((webview: Electron.WebviewTag) => webview.getTitle())
          .then((title) => title === "E2E Page"),
      "the second page to load",
    );

    // The new pane is active, so the first click moves away from it
    for (const [index, expected] of [
      [0, url],
      [1, second],
      [0, url],
    ] as const) {
      await clickPage(index);
      await expectActivePane(expected);
    }
  });

  // The File menu has its own Cmd+T, but Playwright's keys never reach menus
  it("runs the app's shortcuts while a page has focus", async () => {
    await clickPage(0);
    await app.page.keyboard.press("Meta+p");
    const quickOpen = app.page.getByPlaceholder(/Search files by name/);
    await quickOpen.waitFor();
    await app.page.keyboard.press("Escape");
    await quickOpen.waitFor({ state: "hidden" });

    await clickPage(0);
    await app.page.keyboard.press("Meta+t");
    await selectedTab(1).waitFor();
    await app.page.keyboard.press("Meta+1");
    await selectedTab(0).waitFor();
    await clickPage(0);
    await app.page.keyboard.press("Meta+2");
    await selectedTab(1).waitFor();
    await app.page.keyboard.press("Meta+1");
    await selectedTab(0).waitFor();
  });

  // A background tab parks its pages off screen rather than closing them, and
  // Chromium hides and throttles a page only once none of it is on screen.
  // Playwright's focus emulation keeps every page visible to Chromium, so this
  // checks the parking rather than the page's visibilityState.
  it("moves a background tab's pages fully off screen, and brings the same pages back", async () => {
    const pagesOnScreen = () =>
      app.page.locator("webview").evaluateAll((webviews) =>
        webviews.map((webview) => {
          const box = webview.getBoundingClientRect();
          return (
            box.right > 0 &&
            box.bottom > 0 &&
            box.left < innerWidth &&
            box.top < innerHeight
          );
        }),
      );
    expect(await pagesOnScreen()).toEqual([true, true]);
    await inPage(0, "window.kept = true");

    await app.page.keyboard.press("Meta+2");
    await selectedTab(1).waitFor();
    await until(
      async () => (await pagesOnScreen()).every((shown) => !shown),
      "the background tab's pages to leave the screen",
    );

    await app.page.keyboard.press("Meta+1");
    await selectedTab(0).waitFor();
    await until(
      async () => (await pagesOnScreen()).every(Boolean),
      "the pages to come back on screen",
    );
    expect(await inPage(0, "window.kept")).toBe(true);
  });

  // The browser routes a click by where the window last drew the page, so a
  // click that lands as the page's tab shows goes to the window instead
  for (const focused of ["address bar", "page"]) {
    it(`gives a page the keys when it's clicked as its tab shows, after the ${focused} had focus`, async () => {
      const box = (await app.page.locator("webview").nth(0).boundingBox())!;
      await inPage(
        0,
        `onkeydown = (event) => typed.push(event.key);
        window.typed = [];`,
      );
      // Focus goes back to it when the tab shows
      if (focused === "page") {
        await clickPage(0);
        await until(
          () => inPage(0, "document.hasFocus()"),
          "the page to take focus",
        );
      } else {
        const addresses = app.page.getByPlaceholder("Enter URL...");
        const address = await addresses.evaluateAll(
          (inputs, url) =>
            inputs.findIndex(
              (input) => (input as HTMLInputElement).value === url,
            ),
          url,
        );
        await addresses.nth(address).click();
      }
      await app.page.keyboard.press("Meta+2");
      await selectedTab(1).waitFor();
      await until(
        () =>
          app.page.evaluate(() =>
            document.activeElement?.matches(".xterm-helper-textarea"),
          ),
        "the second tab's terminal to take focus",
      );
      // Keeps the window from drawing the page where Cmd+1 places it, once
      // focus has gone back to where it was. The window can't answer while
      // it waits, so the page tells the test.
      await app.page.evaluate(() => {
        const webview = document.querySelector(
          "webview",
        ) as Electron.WebviewTag;
        const observer = new MutationObserver(() => {
          if (webview.style.left === "-10000px") return;
          observer.disconnect();
          requestAnimationFrame(() => {
            void webview.executeJavaScript(`void fetch("/held")`);
            const end = performance.now() + 1000;
            while (performance.now() < end);
          });
        });
        observer.observe(webview, { attributeFilter: ["style"] });
      });
      // Playwright's click waits for each step to be handled, so it would
      // only land after the window draws again
      const cdp = await app.page.context().newCDPSession(app.page);
      requested.length = 0;
      const switched = app.page.keyboard.press("Meta+1");
      await until(() => requested.includes("/held"), "the window to wait");
      const click = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await Promise.all(
        (["mousePressed", "mouseReleased"] as const).map((type) =>
          cdp.send("Input.dispatchMouseEvent", {
            type,
            ...click,
            button: "left",
            clickCount: 1,
          }),
        ),
      );
      await switched;
      await cdp.detach();

      await inPage(0, "typed.length = 0");
      await app.page.keyboard.type("Ada");
      expect(await inPage(0, `typed.join("")`)).toBe("Ada");
    });
  }

  it("selects the page's address with Cmd+L", async () => {
    await focusPage(0);
    await app.page.keyboard.press("Meta+l");
    expect(await until(selectedAddress, "the address to be selected")).toBe(
      url,
    );
    await focusPage(0);
  });

  it("shows a hidden toolbar while Cmd+L has its address bar focused", async () => {
    await focusPage(0);
    await runCommand("Toggle Browser Toolbar");
    await until(async () => (await addressBars(url)) === 0, "it to hide");

    // Escape gives the page its focus back
    await focusPage(0);
    await app.page.keyboard.press("Meta+l");
    expect(await until(selectedAddress, "the address to be selected")).toBe(
      url,
    );
    await app.page.keyboard.press("Escape");
    await until(async () => (await addressBars(url)) === 0, "it to hide");
    await until(
      () => inPage(0, "document.hasFocus()"),
      "the page to take focus",
    );

    await app.page.keyboard.press("Meta+l");
    await until(selectedAddress, "the address to be selected");
    await focusPage(0);
    await until(async () => (await addressBars(url)) === 0, "it to hide");

    await app.page.keyboard.press("Meta+l");
    await until(selectedAddress, "the address to be selected");
    requested.length = 0;
    await app.page.keyboard.type(`${url}typed`);
    await app.page.keyboard.press("Enter");
    await until(() => requested.includes("/typed"), "the page to load");
    await until(
      async () => (await addressBars(`${url}typed`)) === 0,
      "it to hide",
    );
    await until(
      () => inPage(0, "document.hasFocus()"),
      "the page to take focus",
    );

    const panes = await conduit<Pane[]>("pane-list -t browser");
    const pane = panes.find((candidate) => candidate.url === `${url}typed`);
    expect(
      await terminal.run(`conduit browser-navigate -p ${pane!.id} ${url}`),
    ).toBe(0);
    await runCommand("Toggle Browser Toolbar");
    await until(async () => (await addressBars(url)) === 1, "it to show");
  });

  it("opens a web page from a terminal with Cmd+L", async () => {
    await terminal.locator.click();
    await expectActivePane("terminal");
    await app.page.keyboard.press("Meta+l");
    const dialog = app.page.getByRole("dialog", { name: "Open Web Page" });
    const open = dialog.getByRole("button", { name: "Open", exact: true });
    await open.waitFor();
    expect(await open.isDisabled()).toBe(true);

    // Without a scheme, a local address opens over http
    const address = url.replace("127.0.0.1", "localhost");
    await dialog
      .getByPlaceholder("Enter a URL or search")
      .fill(`${address.slice("http://".length)}dialog`);
    expect(await open.isDisabled()).toBe(false);
    await app.page.keyboard.press("Enter");
    await dialog.waitFor({ state: "hidden" });
    await expectActivePane(`${address}dialog`);

    const panes = await conduit<Pane[]>("pane-list -t browser");
    const pane = panes.find((candidate) => candidate.url.endsWith("/dialog"));
    expect(await terminal.run(`conduit pane-close -p ${pane!.id}`)).toBe(0);
  });

  it("leaves a page its editing keys and the keys the app isn't using", async () => {
    await clickPage(0);
    await inPage(
      0,
      `window.pressed = [];
      addEventListener("keydown", (event) => pressed.push(event.key));
      const input = document.querySelector("input");
      input.value = "Ada";
      input.focus();`,
    );

    // The app moves between panes with Cmd+Left
    await app.page.keyboard.press("Meta+a");
    await app.page.keyboard.type("Grace");
    await app.page.keyboard.press("Meta+ArrowLeft");
    await app.page.keyboard.type("Hi ");
    // The app's Cmd+B is only for editors
    await app.page.keyboard.press("Meta+b");
    // Sites open their search with Cmd+K, which starts the app's Cmd+K Cmd+S
    await app.page.keyboard.press("Meta+k");

    expect(await inPage(0, `document.querySelector("input").value`)).toBe(
      "Hi Grace",
    );
    expect(await inPage(0, `pressed.includes("b")`)).toBe(true);
    expect(await inPage(0, `pressed.includes("k")`)).toBe(true);
    await expectActivePane(url);
  });

  it("runs a two-key shortcut started in a page once the user binds its first key on its own", async () => {
    fs.writeFileSync(
      path.join(app.home, ".conduit", "keybindings.json"),
      JSON.stringify([{ key: "Cmd+K", command: "view.showCommandPalette" }]),
    );
    await clickPage(0);
    // Escape ends the app's wait for a second key once it takes Cmd+K
    await until(async () => {
      await inPage(0, "pressed.length = 0");
      await app.page.keyboard.press("Meta+k");
      await app.page.keyboard.press("Escape");
      return inPage(0, `!pressed.includes("k")`);
    }, "the app to take Cmd+K");

    await app.page.keyboard.press("Meta+k");
    await app.page.keyboard.press("Meta+s");
    const shortcuts = app.page.getByPlaceholder(/Search keybindings/);
    await shortcuts.waitFor();
    await app.page.keyboard.press("Escape");
    await shortcuts.waitFor({ state: "hidden" });
  });

  it("goes back, forward and reloads with the page focused", async () => {
    const panes = await conduit<Pane[]>("pane-list -t browser");
    const pane = panes.find((candidate) => candidate.url === url);
    for (const path of ["back", "forward"]) {
      expect(
        await terminal.run(
          `conduit browser-navigate -p ${pane!.id} ${url}${path}`,
        ),
      ).toBe(0);
    }
    await clickPage(0);
    await expectActivePane(`${url}forward`);
    await until(
      () => inPage(0, "document.hasFocus()"),
      "the page to take focus",
    );

    await app.page.keyboard.press("Meta+BracketLeft");
    await expectActivePane(`${url}back`);
    await app.page.keyboard.press("Meta+BracketRight");
    await expectActivePane(`${url}forward`);
    requested.length = 0;
    await app.page.keyboard.press("Meta+r");
    await until(() => requested.includes("/forward"), "the page to reload");

    expect(
      await terminal.run(`conduit browser-navigate -p ${pane!.id} ${url}`),
    ).toBe(0);
  });

  // An address has no spaces to wrap at
  it("keeps a long address's tooltip inside the window", async () => {
    const panes = await conduit<Pane[]>("pane-list -t browser");
    const pane = panes.find((candidate) => candidate.url === url);
    const long = `${url}?${"0".repeat(300)}`;
    expect(
      await terminal.run(
        `conduit browser-navigate -p ${pane!.id} "${url}?$(printf '%0300d' 0)"`,
      ),
    ).toBe(0);
    await clickPage(0);
    await expectActivePane(long);

    await app.page.getByRole("tab", { selected: true }).focus();
    const tooltip = app.page.getByRole("tooltip").filter({ hasText: long });
    await tooltip.waitFor();
    await tooltip.evaluate((element) =>
      Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      ),
    );

    const box = (await tooltip.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(
      await app.page.evaluate(() => innerWidth),
    );
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});
