import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, inWebview, launch, type Terminal, until } from "./app";

// Records the keys a page gets, to tell which page has the keyboard
const recordKeys = `<script>
  window.keys = "";
  addEventListener("keydown", (event) => (keys += event.key));
</script>`;

const pages: Record<string, string> = {
  "/links": `<!doctype html>
<title>Links</title>
${recordKeys}
<a id="blank" href="/blank" target="_blank">Blank</a>
<a id="background" href="/background">Background</a>
<button id="open" onclick="window.open('/opened')">Open</button>
<button id="sign-in" onclick="popup = window.open('/authorize', 'sign-in', 'popup,width=480,height=640')">Sign in</button>
<script>
  window.messages = [];
  addEventListener("message", (event) => messages.push(event.data));
</script>`,
  // Reports the size it got, which is what the page asked for
  "/callback": `<script>
  opener.postMessage(\`signed in at \${innerWidth}x\${innerHeight}\`, "*");
  close();
</script>`,
  // Opens a popup well after any click
  "/unprompted": `<!doctype html>
<title>Unprompted</title>
<script>
  setTimeout(() => {
    window.opened = String(window.open("/popup", "ad", "popup,width=400,height=400"));
  }, 1500);
</script>`,
};

interface Pane {
  id: string;
  url: string;
}

describe("a page's new tabs and popups", () => {
  let server: http.Server;
  let origin: string;
  let app: Conduit;
  let terminal: Terminal;
  const requested: string[] = [];
  const userAgents = new Set<string>();

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      requested.push(request.url!);
      userAgents.add(request.headers["user-agent"]!);
      if (request.url === "/authorize") {
        response.writeHead(302, { location: "/callback" });
        response.end();
        return;
      }
      response.writeHead(200, {
        "content-type": "text/html",
        // The sign-in popup's cookie, which signs the page in too
        ...(request.url === "/callback" && {
          "set-cookie": "signed-in=yes; Path=/",
        }),
      });
      response.end(
        pages[request.url!] ?? `<title>${request.url}</title>${recordKeys}`,
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    app = await launch({
      name: "browser-session",
      // Outlines the active pane, so a test can see which one it is
      settings: { alwaysHighlightActivePane: true },
    });
    terminal = await app.terminal();
  });

  afterAll(async () => {
    await app?.close();
    server?.close();
  });

  async function browserPanes(): Promise<Pane[]> {
    expect(
      await terminal.run("conduit pane-list -t browser > ~/panes.json"),
    ).toBe(0);
    return JSON.parse(
      fs.readFileSync(path.join(app.home, "panes.json"), "utf8"),
    ) as Pane[];
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

  /** Runs a script in the first page, returning what it evaluates to. */
  function inPage<T>(script: string): Promise<T> {
    return inWebview(app.page.locator("webview").first(), script);
  }

  /** Clicks an element in the first page the way the user would. */
  async function click(
    selector: string,
    { button = "left", meta = false } = {},
  ) {
    const page = (await app.page.locator("webview").first().boundingBox())!;
    const element = await inPage<{ x: number; y: number }>(
      `(() => {
        const { x, y, width, height } = document
          .querySelector(${JSON.stringify(selector)})
          .getBoundingClientRect();
        return { x: x + width / 2, y: y + height / 2 };
      })()`,
    );
    if (meta) await app.page.keyboard.down("Meta");
    await app.page.mouse.click(page.x + element.x, page.y + element.y, {
      button: button as "left" | "middle",
    });
    if (meta) await app.page.keyboard.up("Meta");
  }

  /** Types a key, returning what each page got. */
  async function typeInPages(key: string): Promise<string[]> {
    const pages = (code: string) =>
      app.page
        .locator("webview")
        .evaluateAll(
          (elements, code) =>
            Promise.all(
              elements.map((element) =>
                (element as Electron.WebviewTag).executeJavaScript(code),
              ),
            ),
          code,
        );
    await pages("keys = ''");
    await app.page.keyboard.press(key);
    return pages("keys");
  }

  /**
   * Waits for a pane with the page next to the one that opened it. The new
   * page gets the keys, or the page that opened it keeps them when it opened
   * in the background. Then closes it.
   */
  async function expectPane(url: string, { background = false } = {}) {
    const webviews = app.page.locator("webview");
    try {
      await until(async () => (await webviews.count()) === 2, "a second page");
      const active = background ? `${origin}/links` : url;
      await until(
        async () => (await activePane()) === active,
        `${active} to be the active pane`,
      );
      // An active pane settles focus for up to half a second. Checked before
      // the CLI runs, which types in the terminal.
      await app.page.waitForTimeout(600);
      expect(await typeInPages("x")).toEqual(
        background ? ["x", ""] : ["", "x"],
      );
      const [source, opened] = await webviews.evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().x),
      );
      expect(opened).toBeGreaterThan(source);
    } finally {
      await closePane(url);
    }
  }

  /**
   * Closes a page's pane, even after a test fails, so the tests after it
   * start from the one page.
   */
  async function closePane(url: string) {
    const pane = (await browserPanes()).find(
      (candidate) => candidate.url === url,
    );
    if (pane) await terminal.run(`conduit pane-close -p ${pane.id}`);
    await until(
      async () => (await app.page.locator("webview").count()) === 1,
      "the pane to close",
    );
    await painted();
  }

  /**
   * Waits for the first page to paint at its pane's size. Until it does, as
   * when it first loads or grows back after a pane closes, a click lands on
   * Conduit's webview element instead of the page.
   */
  async function painted() {
    const { width } = (await app.page
      .locator("webview")
      .first()
      .boundingBox())!;
    await until(
      () => inPage(`Math.abs(innerWidth - ${width}) <= 1`),
      "the page to take its pane's size",
    );
    await inPage(
      "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
    );
  }

  it("opens a page of links", async () => {
    expect(await terminal.run("conduit split right -t browser")).toBe(0);
    expect(await terminal.run(`conduit browser-navigate ${origin}/links`)).toBe(
      0,
    );
    await until(() => inPage("document.title === 'Links'"), "the links page");
    await painted();
  });

  it("opens a link meant for a new tab in an active pane next to the page", async () => {
    await click("#blank");
    await expectPane(`${origin}/blank`);
  });

  it("opens a page that a click opens with window.open in an active pane", async () => {
    await click("#open");
    await expectPane(`${origin}/opened`);
  });

  for (const [how, options] of [
    ["Cmd-click", { meta: true }],
    ["middle-click", { button: "middle" }],
  ] as const) {
    it(`opens a link the user ${how}s in a pane behind the page`, async () => {
      await click("#background", options);
      await expectPane(`${origin}/background`, { background: true });
    });
  }

  it("gives the keys to the page the user moves to with Cmd-Option-arrows", async () => {
    const webviews = app.page.locator("webview");
    await click("#blank");
    try {
      await until(async () => (await webviews.count()) === 2, "a second page");
      await until(
        async () => (await activePane()) === `${origin}/blank`,
        "the page to open",
      );
      await app.page.waitForTimeout(600);
      // From the page that just opened, which has the keys, and back and
      // forth after that
      for (const [key, url, typed] of [
        ["Meta+Alt+ArrowLeft", `${origin}/links`, ["x", ""]],
        ["Meta+Alt+ArrowRight", `${origin}/blank`, ["", "x"]],
        ["Meta+Alt+ArrowLeft", `${origin}/links`, ["x", ""]],
      ] as const) {
        await app.page.keyboard.press(key);
        await until(
          async () => (await activePane()) === url,
          `${url} to be the active pane`,
        );
        await app.page.waitForTimeout(600);
        expect(await typeInPages("x")).toEqual(typed);
      }
    } finally {
      await closePane(`${origin}/blank`);
    }
  });

  it("signs in through a popup window that reports back to the page", async () => {
    await click("#sign-in");

    await until(
      () => inPage("messages.includes('signed in at 480x640') && popup.closed"),
      "the popup to report back and close",
    );
    expect(requested).toContain("/callback");
    expect(await browserPanes()).toHaveLength(1);
    // The popup browses in the page's session, so its sign-in is the page's
    expect(await inPage("document.cookie")).toContain("signed-in=yes");
  });

  it("keeps pages' cookies in the browser's own session, apart from Conduit's", async () => {
    const devTools = await app.page.context().newCDPSession(app.page);
    const { cookies } = await devTools.send("Network.getAllCookies");
    await devTools.detach();

    expect(cookies.map((cookie) => cookie.name)).not.toContain("signed-in");
    expect(
      fs.existsSync(path.join(app.home, "ud", "Partitions", "browser")),
    ).toBe(true);
  });

  it("lets pages copy, keep the screen awake and see where the user is, and tells them no to the rest", async () => {
    // Only probes that can't show a macOS prompt or take over the screen
    const permissions = await inPage<Record<string, string>>(`(async () => {
      const states = {};
      for (const name of ["clipboard-write", "screen-wake-lock", "clipboard-read", "notifications", "geolocation", "camera", "microphone"]) {
        states[name] = (await navigator.permissions.query({ name })).state;
      }
      states.wakeLock = await navigator.wakeLock.request("screen").then(
        (lock) => lock.release().then(() => "granted"),
        (error) => error.name,
      );
      states.notification = await Notification.requestPermission();
      return states;
    })()`);

    expect(permissions).toEqual({
      "clipboard-write": "granted",
      "screen-wake-lock": "granted",
      "clipboard-read": "denied",
      notifications: "denied",
      geolocation: "granted",
      camera: "denied",
      microphone: "denied",
      wakeLock: "granted",
      notification: "denied",
    });
  });

  it("blocks a popup the user didn't click for", async () => {
    expect(
      await terminal.run(`conduit browser-navigate ${origin}/unprompted`),
    ).toBe(0);

    await until(() => inPage("'opened' in window"), "the page to try");
    expect(await inPage("opened")).toBe("null");
    expect(requested).not.toContain("/popup");
    expect(await browserPanes()).toHaveLength(1);
  });

  // Last, so every page and popup above has made its requests
  it("tells sites it's Chrome, not Conduit on Electron", async () => {
    const userAgent = await inPage<string>("navigator.userAgent");

    expect(userAgent).toMatch(/ Chrome\/[\d.]+ Safari\/[\d.]+$/);
    expect(userAgent).not.toMatch(/Conduit|Electron/);
    expect([...userAgents]).toEqual([userAgent]);
  });
});
