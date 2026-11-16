import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { Dialog } from "playwright-core";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  type Conduit,
  happens,
  inWebview,
  launch,
  runCommand,
  type Terminal,
  until,
} from "./app";

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
  /** Responses to /stalled, which stay open until a test ends them. */
  const stalled: http.ServerResponse[] = [];

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      requested.push(request.url!);
      response.writeHead(200, { "content-type": "text/html" });
      if (request.url === "/stalled") {
        // Its page never finishes loading, and says when it has drawn
        response.write(
          `${page}<script>requestAnimationFrame(() => requestAnimationFrame(() => fetch("/painted")))</script>`,
        );
        stalled.push(response);
      } else if (request.url === "/dark-ready") {
        // A page that reads well in dark mode too, and says so
        response.end(
          page.replace(
            "<title>",
            '<meta name="color-scheme" content="light dark"><title>',
          ),
        );
      } else {
        response.end(page);
      }
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
    for (const response of stalled) response.end();
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
        'input[placeholder="Search or enter address"]',
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
    return inWebview(app.page.locator("webview").nth(index), script);
  }

  /**
   * Presses Cmd and the key in a focused page, and lets go once `done`, for
   * a key that navigates or closes the page. Either takes away the frame with
   * the keys, which never acknowledges a key let go as it goes, so a whole
   * press would wait for that forever.
   */
  async function pressInPage(
    key: string,
    done: () => Promise<boolean>,
    what: string,
  ) {
    await app.page.keyboard.down("Meta");
    await app.page.keyboard.down(key);
    await until(done, what);
    await app.page.keyboard.up(key);
    await app.page.keyboard.up("Meta");
  }

  /** Presses Cmd and the key, which navigate the nth page. */
  async function navigateWith(index: number, key: string) {
    const webview = app.page.locator("webview").nth(index);
    await webview.evaluate((webview: Electron.WebviewTag) => {
      webview.dataset.navigated = "false";
      const navigated = () => {
        webview.dataset.navigated = "true";
        webview.removeEventListener("did-navigate", navigated);
      };
      webview.addEventListener("did-navigate", navigated);
    });
    await pressInPage(
      key,
      () =>
        webview.evaluate(
          (webview: Electron.WebviewTag) =>
            webview.dataset.navigated === "true",
        ),
      "the page to navigate",
    );
  }

  /** Closes the nth page's tab or quick pane with Cmd+W from the page. */
  async function closeFromPage(index: number) {
    await app.page
      .locator("webview")
      .nth(index)
      .evaluate((webview) => {
        (webview as HTMLElement).dataset.closing = "";
      });
    await pressInPage(
      "w",
      async () =>
        (await app.page.locator("webview[data-closing]").count()) === 0,
      "the page to close",
    );
  }

  /** The focused address bar's address, once all of it is selected. */
  function selectedAddress(): Promise<string | null> {
    return app.page.evaluate(() => {
      const input = document.activeElement as HTMLInputElement | null;
      if (input?.placeholder !== "Search or enter address") return null;
      const all =
        input.selectionStart === 0 && input.selectionEnd === input.value.length;
      return all ? input.value : null;
    });
  }

  /** How many address bars show the given address. */
  function addressBars(address: string): Promise<number> {
    return app.page
      .getByPlaceholder("Search or enter address")
      .evaluateAll(
        (inputs, address) =>
          inputs.filter(
            (input) => (input as HTMLInputElement).value === address,
          ).length,
        address,
      );
  }

  /**
   * Waits for the nth page to take focus and draw. Keys that come before a
   * new page first draws don't reach it.
   */
  function pageFocused(index: number) {
    return until(
      () =>
        inPage(
          index,
          "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(document.hasFocus()))))",
        ),
      "the page to take focus",
    );
  }

  async function focusPage(index: number) {
    await clickPage(index);
    await pageFocused(index);
  }

  /** The nth tab, once it's the selected one. */
  function selectedTab(index: number) {
    return app.page
      .getByRole("tab")
      .nth(index)
      .and(app.page.getByRole("tab", { selected: true }));
  }

  const quickPanes = () => app.page.locator("[data-quick-pane]");
  const quickPaneCount = (count: number) =>
    until(
      async () => (await quickPanes().count()) === count,
      `${count} quick panes`,
    );
  // The strip is hidden from roles while a quick pane is open
  const stripTabs = () => app.page.getByRole("tab", { includeHidden: true });

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
      const address = app.page.getByPlaceholder("Search or enter address");
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
  // checks the parking, and browser-restore.test.ts checks that a parked page
  // is hidden in a launch without it.
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
        await pageFocused(0);
      } else {
        const addresses = app.page.getByPlaceholder("Search or enter address");
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
    await runCommand(app.page, "Toggle Browser Toolbar");
    await until(async () => (await addressBars(url)) === 0, "it to hide");

    // Escape gives the page its focus back
    await focusPage(0);
    await app.page.keyboard.press("Meta+l");
    expect(await until(selectedAddress, "the address to be selected")).toBe(
      url,
    );
    await app.page.keyboard.press("Escape");
    await until(async () => (await addressBars(url)) === 0, "it to hide");
    await pageFocused(0);

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
    await pageFocused(0);

    const panes = await conduit<Pane[]>("pane-list -t browser");
    const pane = panes.find((candidate) => candidate.url === `${url}typed`);
    expect(
      await terminal.run(`conduit browser-navigate -p ${pane!.id} ${url}`),
    ).toBe(0);
    await pageFocused(0);
    await runCommand(app.page, "Toggle Browser Toolbar");
    await until(async () => (await addressBars(url)) === 1, "it to show");
  });

  describe("a Quick Browser", () => {
    // A page's webview goes on the body as its pane first shows
    const quickPageIndex = async () =>
      (await app.page.locator("webview").count()) - 1;

    /** Opens a Quick Browser with Cmd+L, and goes to `address` in it. */
    async function openQuickBrowser(address?: string): Promise<number> {
      const before = await quickPanes().count();
      await app.page.keyboard.press("Meta+l");
      await quickPaneCount(before + 1);
      await until(
        () =>
          quickPanes()
            .last()
            .getByPlaceholder("Search or enter address")
            .evaluate((input) => input === document.activeElement),
        "focus in its address bar",
      );
      const index = await quickPageIndex();
      if (address) await goTo(index, address);
      return index;
    }

    /**
     * Types `address` in the nth page's focused address bar, and lets go of
     * Enter once the page is there. Enter gives the page the keys, and the
     * page it replaces never acknowledges the key let go, see `pressInPage`.
     */
    async function goTo(index: number, address: string) {
      await app.page.keyboard.type(address);
      await app.page.keyboard.down("Enter");
      const { pathname } = new URL(address.replace(/^(?!http)/, "http://"));
      await until(
        async () => (await inPage(index, "location.pathname")) === pathname,
        `${pathname} to load`,
      );
      await app.page.keyboard.up("Enter");
      await pageFocused(index);
    }

    /** Whether the nth page is what shows at the middle of it. */
    function pageOnTop(index: number): Promise<boolean> {
      return app.page.evaluate((index) => {
        const page = document.querySelectorAll("webview")[index]!;
        const box = page.getBoundingClientRect();
        const middle = [box.x + box.width / 2, box.y + box.height / 2];
        return document.elementFromPoint(middle[0]!, middle[1]!) === page;
      }, index);
    }

    it("opens from a terminal with Cmd+L, its page floating over the pane with the keys", async () => {
      const tabs = await stripTabs().count();
      await terminal.locator.click();
      await expectActivePane("terminal");
      const index = await openQuickBrowser();

      // Without a scheme, a local address opens over http
      const local = url.replace("127.0.0.1", "localhost");
      await goTo(index, `${local.slice("http://".length)}quick`);
      expect(await inPage(index, "location.href")).toBe(`${local}quick`);

      const pane = (await quickPanes().boundingBox())!;
      const page = app.page.locator("webview").nth(index);
      const box = (await page.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(pane.x);
      expect(box.y).toBeGreaterThanOrEqual(pane.y);
      expect(box.x + box.width).toBeLessThanOrEqual(pane.x + pane.width);
      expect(box.y + box.height).toBeLessThanOrEqual(pane.y + pane.height);
      expect(await pageOnTop(index)).toBe(true);
      // The quick pane hides the rest of the body from assistive tech
      expect(await page.getAttribute("aria-hidden")).toBeNull();
      expect(await stripTabs().count()).toBe(tabs);
    });

    it("gives an Escape to its page first, and closes on one the page doesn't use", async () => {
      const index = await quickPageIndex();
      await inPage(
        index,
        `onkeydown = (event) => {
          if (event.key === "Escape" && holding) {
            event.preventDefault();
            held++;
          }
        };
        window.held = 0;
        window.holding = true;`,
      );
      await app.page.keyboard.press("Escape");
      await until(() => inPage(index, "held === 1"), "the page's Escape");
      expect(
        await happens(
          async () => (await quickPanes().count()) === 0,
          "the Quick Browser to close",
        ),
      ).toBe(false);

      await inPage(index, "holding = false");
      await app.page.keyboard.press("Escape");
      await quickPaneCount(0);
      await until(() => terminal.focused(), "focus back in the terminal");
    });

    it("puts back what was typed in its address bar on the first Escape, and closes on the next", async () => {
      await openQuickBrowser();
      const field = quickPanes().getByPlaceholder("Search or enter address");
      await app.page.keyboard.type("not there yet");
      await app.page.keyboard.press("Escape");
      await until(
        async () => (await field.inputValue()) === "",
        "what was typed to go",
      );
      expect(
        await happens(
          async () => (await quickPanes().count()) === 0,
          "the Quick Browser to close",
        ),
      ).toBe(false);

      await app.page.keyboard.press("Escape");
      await quickPaneCount(0);
    });

    it("keeps its page and the keys as it opens in a tab", async () => {
      const tabs = await stripTabs().count();
      const index = await openQuickBrowser(`${url}kept`);
      await inPage(index, "window.kept = true");

      requested.length = 0;
      await quickPanes()
        .getByRole("toolbar", { name: "Quick Pane" })
        .getByRole("button", { name: "Open in Tab", exact: true })
        .click();
      await quickPaneCount(0);
      await until(
        async () => (await stripTabs().count()) === tabs + 1,
        "its tab",
      );
      await pageFocused(index);
      expect(await inPage(index, "window.kept")).toBe(true);
      expect(requested).not.toContain("/kept");
      expect(await pageOnTop(index)).toBe(true);

      await closeFromPage(index);
      await until(
        async () => (await stripTabs().count()) === tabs,
        "its tab to close",
      );
      await app.page.keyboard.press("Meta+1");
      await selectedTab(0).waitFor();
    });

    it("goes under the palette, and under a quick pane stacked in front of it", async () => {
      fs.writeFileSync(path.join(app.home, "stacked.txt"), "stacked\n");
      // Opens a quick editor once the test says so. It goes home first, since
      // the terminal's directory was removed by now.
      await terminal.type(
        '(cd; until [ -e stack ]; do sleep 0.1; done; conduit --quick stacked.txt; echo stacked-""closed) &\n',
      );
      const index = await openQuickBrowser(`${url}stacked`);

      await app.page.keyboard.press("Meta+Shift+p");
      const palette = app.page.getByTestId("command-palette");
      await palette.waitFor();
      // The palette takes the pointer a render after it shows, once its layer
      // is stacked over the quick pane's
      await until(
        () =>
          palette.evaluate((palette, index) => {
            const box = palette.getBoundingClientRect();
            const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
            const page = document
              .querySelectorAll("webview")
              [index]!.getBoundingClientRect();
            const overPage =
              x > page.left &&
              x < page.right &&
              y > page.top &&
              y < page.bottom;
            return (
              overPage && palette.contains(document.elementFromPoint(x, y))
            );
          }, index),
        "the palette on top, over the page",
      );
      await app.page.keyboard.press("Escape");
      await palette.waitFor({ state: "hidden" });
      expect(await quickPanes().count()).toBe(1);

      fs.writeFileSync(path.join(app.home, "stack"), "");
      await quickPaneCount(2);
      const editor = quickPanes().last().locator(".monaco-editor");
      await until(
        () =>
          editor.evaluate((editor) => editor.contains(document.activeElement)),
        "focus in the quick editor",
      );
      expect(await pageOnTop(index)).toBe(false);

      await app.page.keyboard.press("Escape");
      await quickPaneCount(1);
      await terminal.waitForText("stacked-closed");
      await pageFocused(index);
      expect(await pageOnTop(index)).toBe(true);

      await closeFromPage(index);
      await quickPaneCount(0);
    });
  });

  it("leaves a page behind a quick pane without the keys as the pane opens in a tab", async () => {
    fs.writeFileSync(path.join(app.home, "behind.txt"), "behind\n");
    // Opens a quick editor once the page has the keys. It goes home first,
    // since the terminal's directory was removed by now.
    await terminal.type(
      "(cd; until [ -e behind ]; do sleep 0.1; done; conduit --quick behind.txt) &\n",
    );
    await focusPage(0);
    await inPage(
      0,
      `window.strayed = [];
      addEventListener("keydown", (event) => strayed.push(event.key), true);`,
    );
    fs.writeFileSync(path.join(app.home, "behind"), "");
    await quickPaneCount(1);
    const inEditor = () =>
      app.page.evaluate(
        () => !!document.activeElement?.closest(".monaco-editor"),
      );
    await until(inEditor, "focus in the quick editor");

    const tabs = await stripTabs().count();
    await quickPanes()
      .getByRole("toolbar", { name: "Quick Pane" })
      .getByRole("button", { name: "Open in Tab", exact: true })
      .click();
    await quickPaneCount(0);
    await until(
      async () => (await stripTabs().count()) === tabs + 1,
      "its tab",
    );
    await until(inEditor, "focus in the editor's tab");
    await app.page.evaluate(() => {
      const editor = document.activeElement as HTMLElement;
      editor.dataset.pressed = "";
      editor.addEventListener("keydown", (event) => {
        editor.dataset.pressed += event.key;
      });
    });
    await app.page.keyboard.press("ArrowRight");
    expect(
      await app.page.locator("[data-pressed]").getAttribute("data-pressed"),
    ).toBe("ArrowRight");
    expect(await inPage(0, "strayed")).toEqual([]);

    await app.page.keyboard.press("Meta+w");
    await until(
      async () => (await stripTabs().count()) === tabs,
      "its tab to close",
    );
    await app.page.keyboard.press("Meta+1");
    await selectedTab(0).waitFor();
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
    // Waits for each page to load, and the next test presses a key sooner
    await clickPage(0);
    await expectActivePane(`${url}forward`);
    await pageFocused(0);

    await navigateWith(0, "BracketLeft");
    await expectActivePane(`${url}back`);
    await pageFocused(0);
    await navigateWith(0, "BracketRight");
    await expectActivePane(`${url}forward`);
    await pageFocused(0);
    requested.length = 0;
    await navigateWith(0, "r");
    await until(() => requested.includes("/forward"), "the page to reload");

    expect(
      await terminal.run(`conduit browser-navigate -p ${pane!.id} ${url}`),
    ).toBe(0);
  });

  // A page gets the app's keys as it starts, so a page that hangs can be
  // reloaded
  it("reloads a page that hasn't finished loading", async () => {
    const panes = await conduit<Pane[]>("pane-list -t browser");
    const pane = panes.find((candidate) => candidate.url === url);
    // As a link on the page would, so nothing waits on the load that the
    // reload cuts short
    await inPage(0, "location.assign('/stalled')");
    await clickPage(0);
    await expectActivePane(`${url}stalled`);
    // The page can't run scripts to say it has focus until it has loaded
    await until(
      () =>
        app.page.evaluate(() => document.activeElement?.tagName === "WEBVIEW"),
      "the page to take focus",
    );
    // Keys that come before the page first draws don't reach it
    await until(() => requested.includes("/painted"), "the page to draw");

    requested.length = 0;
    await navigateWith(0, "r");
    await until(() => requested.includes("/stalled"), "the page to reload");

    for (const response of stalled.splice(0)) response.end();
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

  it("shows the page's elements in its dev tools", async () => {
    const pages = await app.page.locator("webview").count();
    const toggleDevTools = async (item: string) => {
      await app.page
        .getByRole("button", { name: "More options" })
        .first()
        .click();
      await app.page.getByRole("menuitem", { name: item }).click();
      // The menu gives its button focus back as it finishes closing, which
      // would take the keys from whatever the next test clicks
      await app.page.getByRole("menu").waitFor({ state: "detached" });
    };
    // The dev tools' page is the newest webview. Its Elements panel draws the
    // page's tree in shadow roots, so this gathers every text node.
    const devToolsText = () =>
      inPage<string>(
        pages,
        `(() => {
          const text = [];
          const walk = (node) => {
            if (node.nodeType === Node.TEXT_NODE) text.push(node.textContent);
            if (node.shadowRoot) walk(node.shadowRoot);
            for (const child of node.childNodes) walk(child);
          };
          walk(document);
          return text.join(" ");
        })()`,
      );

    await toggleDevTools("Open dev tools");
    expect(
      await until(
        async () => (await devToolsText()).includes("Greet"),
        "the dev tools to show the page's elements",
      ),
    ).toBe(true);

    await toggleDevTools("Close dev tools");
    await until(
      async () => (await app.page.locator("webview").count()) === pages,
      "the dev tools to close",
    );
  });

  describe("a terminal's links", () => {
    // The test before may have left a page with the keys
    beforeEach(() => terminal.locator.click());

    afterEach(async () => {
      await terminal.locator.click();
      const panes = await conduit<Pane[]>("pane-list -t browser");
      for (const pane of panes.filter(({ url }) => url.includes("/link-"))) {
        await terminal.run(`conduit pane-close -p ${pane.id}`);
      }
    });

    /**
     * Prints a link to the page at `path`, or a hyperlink to it showing `label`
     * (OSC 8), and where its text shows
     */
    async function printLink(path: string, label?: string) {
      const link = `${url}${path}`;
      const command = label
        ? `printf '\\e]8;;%s\\e\\\\%s\\e]8;;\\e\\\\\\n' ${link} ${label}`
        : `echo ${link}`;
      expect(await terminal.run(command)).toBe(0);
      const rows = terminal.locator.locator(".xterm-rows > div");
      const row = await rows.evaluateAll(
        (divs, text) =>
          divs.map((div) => div.textContent.trimEnd()).lastIndexOf(text),
        label ?? link,
      );
      const box = (await rows.nth(row).boundingBox())!;
      // A few characters into the link, which starts its row
      return { link, x: box.x + 20, y: box.y + box.height / 2 };
    }

    /**
     * The pointer the terminal shows over the link xterm sees under it, which
     * it forgets for a moment whenever it looks for one again
     */
    const pointer = () =>
      terminal.locator
        .locator(".xterm-screen")
        .evaluate((screen) =>
          screen.classList.contains("xterm-cursor-pointer")
            ? getComputedStyle(screen).cursor
            : "no link",
        );

    /** Moves the pointer onto the link, which xterm notices as it moves */
    async function hover({ x, y }: { x: number; y: number }) {
      await app.page.mouse.move(x - 5, y);
      await app.page.mouse.move(x, y);
    }

    async function holding(keys: string[], action: () => Promise<unknown>) {
      for (const key of keys) await app.page.keyboard.down(key);
      try {
        await action();
      } finally {
        for (const key of [...keys].reverse()) await app.page.keyboard.up(key);
      }
    }

    const looksClickable = () =>
      until(
        async () => (await pointer()) === "pointer",
        "the link to look clickable",
      );

    /** Clicks the link holding `keys`, once it looks clickable */
    async function clickLink(link: { x: number; y: number }, keys: string[]) {
      await hover(link);
      await holding(keys, async () => {
        await looksClickable();
        await app.page.mouse.click(link.x, link.y);
      });
    }

    const pages = () => app.page.locator("webview").count();

    /** Waits for the newest page to load `link`, and the terminal kept the keys */
    async function expectLoadedBeside(link: string) {
      await until(
        async () =>
          (await inPage(
            (await pages()) - 1,
            "document.readyState === 'complete' && location.href",
          )) === link,
        `${link} to load`,
      );
      await expectActivePane("terminal");
      expect(await terminal.focused()).toBe(true);
    }

    it("look clickable only while Cmd is down, and open on Cmd-click beside the terminal, in the same pane each time", async () => {
      const before = await pages();
      const first = await printLink("link-a");
      await hover(first);
      await holding(["Meta"], looksClickable);
      await until(
        async () => (await pointer()) === "text",
        "the link to look like text again",
      );
      await holding(["Meta"], looksClickable);

      // A plain click just clicks the terminal
      await app.page.mouse.click(first.x, first.y);
      await clickLink(first, ["Meta"]);
      await expectLoadedBeside(first.link);
      expect(await pages()).toBe(before + 1);

      const second = await printLink("link-b");
      await clickLink(second, ["Meta"]);
      await expectLoadedBeside(second.link);
      await until(
        async () => (await addressBars(first.link)) === 0,
        "the first link's pane to move on to the second",
      );
      expect(await pages()).toBe(before + 1);
    });

    it("open in a new pane on Cmd-Shift-click, without extending the terminal's selection", async () => {
      const before = await pages();
      const link = await printLink("link-c");
      // Selects the marker the command printed after it, on the row below
      const rowHeight = await terminal.locator
        .locator(".xterm-rows > div")
        .first()
        .evaluate((row) => row.getBoundingClientRect().height);
      await app.page.mouse.dblclick(link.x, link.y + rowHeight);
      // The widths of the rows it shows, once xterm draws it on the next frame
      const selection = () =>
        terminal.locator.locator(".xterm-selection").evaluate(async (layer) => {
          await new Promise((drawn) =>
            requestAnimationFrame(() => requestAnimationFrame(drawn)),
          );
          return [...layer.children].flatMap((part) => {
            const { width, height } = part.getBoundingClientRect();
            return height ? [Math.round(width)] : [];
          });
        });
      const selected = await until(async () => {
        const parts = await selection();
        return parts.length === 1 && parts;
      }, "the marker to be selected");

      await hover(link);
      await holding(["Meta", "Shift"], async () => {
        await looksClickable();
        await app.page.mouse.down();
        // Shift-click extends a selection as the button goes down, and a link
        // opens as it comes up, before its pane narrows the terminal
        expect(await selection()).toEqual(selected);
        await app.page.mouse.up();
      });
      await expectLoadedBeside(link.link);
      expect(await pages()).toBe(before + 1);
    });

    it("include the hyperlinks programs print, which open the same way, without asking first", async () => {
      const dialogs: string[] = [];
      const dismiss = (dialog: Dialog) => {
        dialogs.push(dialog.message());
        void dialog.dismiss();
      };
      app.page.on("dialog", dismiss);
      try {
        const before = await pages();
        const hyperlink = await printLink("link-d", "hyperlink");
        await hover(hyperlink);
        await holding(["Meta"], looksClickable);
        await until(
          async () => (await pointer()) === "text",
          "the hyperlink to look like text again",
        );

        await app.page.mouse.click(hyperlink.x, hyperlink.y);
        await clickLink(hyperlink, ["Meta"]);
        await expectLoadedBeside(hyperlink.link);
        expect(await pages()).toBe(before + 1);
        expect(dialogs).toEqual([]);
      } finally {
        app.page.off("dialog", dismiss);
      }
    });
  });

  it("shows a page with no background on white in the dark theme, as browsers do, and a page made for dark on dark", async () => {
    await app.page
      .locator("html[data-theme=dark]")
      .waitFor({ state: "attached" });
    await terminal.locator.click();
    const before = await conduit<Pane[]>("pane-list -t browser");
    expect(await terminal.run("conduit split right -t browser")).toBe(0);
    const [pane] = (await conduit<Pane[]>("pane-list -t browser")).filter(
      ({ id }) => !before.some((pane) => pane.id === id),
    );
    const webview = app.page.locator(`webview[id="${pane.id}"]`);

    /** Loads the address, and returns the color below the page's content */
    async function color(address: string) {
      expect(
        await terminal.run(`conduit browser-navigate -p ${pane.id} ${address}`),
      ).toBe(0);
      await until(
        () =>
          webview.evaluate(
            (webview: Electron.WebviewTag, address) =>
              webview.getURL() === address && !webview.isLoading(),
            address,
          ),
        `${address} to load`,
      );
      // Playwright makes every page prefer light, unlike Conduit's dark theme
      for (const context of app.page.context().browser()!.contexts()) {
        for (const page of context.pages()) {
          if (page.url() === address)
            await page.emulateMedia({ colorScheme: null });
        }
      }
      await inWebview(
        webview,
        "new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn)))",
      );
      const png = await webview.screenshot();
      return app.page.evaluate(async (base64) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const image = await createImageBitmap(new Blob([bytes]));
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(
          image.width / 2,
          image.height * 0.9,
          1,
          1,
        );
        return `rgb(${data[0]}, ${data[1]}, ${data[2]})`;
      }, png.toString("base64"));
    }

    try {
      expect(await color(url)).toBe("rgb(255, 255, 255)");
      expect(await color(`${url}dark-ready`)).not.toBe("rgb(255, 255, 255)");
    } finally {
      await terminal.run(`conduit pane-close -p ${pane.id}`);
    }
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});
