import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Locator } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, inWebview, launch, runCommand, until } from "./app";

/**
 * A page that plays a tone when asked. An 18 kHz tone at a thousandth of full
 * volume is too high and too quiet to hear, but it's sound to Chromium, which
 * counts a page as audible by the power of what it plays, not by whether
 * anyone could hear it. So a speaker that shows for it shows because the
 * page's sound was detected, not because it called `start()`. A tone a third
 * as loud is below Chromium's threshold, and shows nothing.
 */
const tone = `<!doctype html><title>Tone</title><script>
  const context = new AudioContext();
  let oscillator;
  function play() {
    oscillator = context.createOscillator();
    oscillator.frequency.value = 18000;
    const gain = context.createGain();
    gain.gain.value = 0.001;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
  }
  function stop() {
    oscillator?.stop();
  }
</script>`;

const server = http.createServer((_, response) => {
  response.writeHead(200, { "content-type": "text/html" });
  response.end(tone);
});
let site: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  site = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

/**
 * Two tabs: one with a page, and one with a shell beside a page, whose tab
 * the shell labels.
 */
const workspace = () => ({
  workspaces: [],
  untitled: {
    lastModified: 0,
    activeTabId: "Page",
    tabs: [
      {
        id: "Page",
        activePaneId: "Page-pane",
        panes: [{ id: "Page-pane", type: "browser", url: `${site}/page` }],
        layout: { id: "Page-layout", type: "pane", paneId: "Page-pane" },
      },
      {
        id: "Split",
        activePaneId: "Split-shell",
        panes: [
          { id: "Split-shell", type: "terminal", cwd: null },
          { id: "Split-page", type: "browser", url: `${site}/split` },
        ],
        layout: {
          id: "Split-layout",
          type: "split",
          direction: "row",
          children: [
            { id: "Split-shell-node", type: "pane", paneId: "Split-shell" },
            { id: "Split-page-node", type: "pane", paneId: "Split-page" },
          ],
        },
      },
    ],
  },
});

describe("a page's sound", () => {
  let app: Conduit;

  beforeAll(async () => {
    app = await launch({
      name: "browser-audio",
      files: { ".conduit/workspaces.json": JSON.stringify(workspace()) },
    });
  });

  afterAll(() => app?.close());

  const pageTab = () => app.page.getByRole("tab").nth(0);
  const splitTab = () => app.page.getByRole("tab").nth(1);
  const page = () => app.page.locator("webview#Page-pane");
  const splitPage = () => app.page.locator("webview#Split-page");
  const bar = () => app.page.locator('[data-node-id="Split-page-node"] button');
  /** A label's speaker, which says whether it mutes or unmutes */
  const speakerIn = (label: Locator) => label.locator("[data-sound]");
  /** A tab's label, before the separator */
  const labelOf = (tab: Locator) => tab.locator(":scope > span:first-child");
  /** The icon before a tab's number, its close button under the pointer */
  const slotIconIn = (tab: Locator) =>
    tab.locator(":scope > span:last-child > svg");

  const showTab = async (tab: Locator) => {
    await tab.click();
    await until(
      async () => (await tab.getAttribute("aria-selected")) === "true",
      "the tab to show",
    );
  };
  const play = (webview: Locator) => inWebview(webview, "play()");
  const stop = (webview: Locator) => inWebview(webview, "stop()");
  const isMuted = (webview: Locator) =>
    webview.evaluate((webview: Electron.WebviewTag) => webview.isAudioMuted());
  const isAudible = (webview: Locator) =>
    webview.evaluate((webview: Electron.WebviewTag) =>
      webview.isCurrentlyAudible(),
    );
  /** Waits for a label's speaker to say the page is playing, or muted */
  const soundOf = async (label: Locator, sound: "playing" | "muted") => {
    const speaker = speakerIn(label);
    await until(
      async () =>
        (await speaker.count()) === 1 &&
        (await speaker.getAttribute("data-sound")) === sound,
      `the speaker to show the page ${sound}`,
    );
    return speaker;
  };
  const quietOn = (label: Locator) =>
    until(
      async () => (await speakerIn(label).count()) === 0,
      "the speaker to go",
    );

  it("shows a speaker after its tab's label while it plays, and goes when it stops", async () => {
    await pageTab().filter({ hasText: /^Tone/ }).waitFor();
    expect(await speakerIn(pageTab()).count()).toBe(0);

    await play(page());

    const speaker = await soundOf(labelOf(pageTab()), "playing");
    expect(await speaker.getAttribute("aria-label")).toBe("Mute");
    expect(await slotIconIn(pageTab()).count()).toBe(1);

    await stop(page());

    await quietOn(pageTab());
  });

  it("mutes its page from its tab, under the pointer, and unmutes it", async () => {
    await play(page());
    await soundOf(pageTab(), "playing");

    // Hovering a tab shows its close button, which leaves the speaker be
    await pageTab().hover();
    await soundOf(pageTab(), "playing");
    await speakerIn(pageTab()).click();

    await until(() => isMuted(page()), "the page to be muted");
    const speaker = await soundOf(pageTab(), "muted");
    expect(await speaker.getAttribute("aria-label")).toBe("Unmute");
    expect(await isAudible(page())).toBe(true);

    await speakerIn(pageTab()).click();

    await until(async () => !(await isMuted(page())), "the page to unmute");
    await soundOf(pageTab(), "playing");
    expect(await app.page.getByRole("tab").count()).toBe(2);
    await stop(page());
    await quietOn(pageTab());
  });

  it("stays muted from page to page", async () => {
    await play(page());
    await (await soundOf(pageTab(), "playing")).click();
    await until(() => isMuted(page()), "the page to be muted");
    await stop(page());

    await inWebview(
      page(),
      `location.href = ${JSON.stringify(`${site}/next`)}`,
    );
    await until(
      async () =>
        (await page().evaluate((webview: Electron.WebviewTag) =>
          webview.getURL(),
        )) === `${site}/next`,
      "the page to go on",
    );
    await play(page());

    await soundOf(pageTab(), "muted");
    expect(await isMuted(page())).toBe(true);

    await speakerIn(pageTab()).click();
    await soundOf(pageTab(), "playing");
    await stop(page());
    await quietOn(pageTab());
  });

  it("shows on its tab while the tab is away, whose speaker mutes it without showing it", async () => {
    await showTab(splitTab());
    await play(page());

    await (await soundOf(pageTab(), "playing")).click();

    await until(() => isMuted(page()), "the page to be muted");
    await soundOf(pageTab(), "muted");
    expect(await pageTab().getAttribute("aria-selected")).toBe("false");

    await speakerIn(pageTab()).click();
    await until(async () => !(await isMuted(page())), "the page to unmute");
    await stop(page());
    await quietOn(pageTab());
  });

  it("shows on its tab from behind the tab's shell, and on its pane's bar when collapsed, whose speaker mutes just its page", async () => {
    await showTab(splitTab());
    await play(splitPage());

    // The shell labels the tab, and the page's speaker shows on it all the same
    await soundOf(splitTab(), "playing");

    await app.page
      .locator('[data-node-id="Split-page-node"]')
      .getByPlaceholder("Search or enter address")
      .click();
    await runCommand(app.page, "Collapse Pane");
    await (await soundOf(bar(), "playing")).click();

    await until(() => isMuted(splitPage()), "the page to be muted");
    await soundOf(bar(), "muted");
    await soundOf(splitTab(), "muted");
    // The speaker's click is its own, so the pane stays collapsed
    expect(await bar().count()).toBe(1);
    expect(await isMuted(page())).toBe(false);

    // The tab's speaker unmutes its pages, the collapsed one's too
    await speakerIn(splitTab()).click();
    await until(
      async () => !(await isMuted(splitPage())),
      "the page to unmute",
    );
    await soundOf(bar(), "playing");

    await stop(splitPage());
    await quietOn(bar());
    await quietOn(splitTab());
  });

  it("keeps its tab's speaker through a short pause, until it's been quiet for two seconds", async () => {
    await play(page());
    await play(splitPage());
    await soundOf(pageTab(), "playing");
    await soundOf(splitTab(), "playing");

    // The other page goes quiet after this one pauses, so its speaker goes
    // after this one's would have, had the pause taken it away
    await stop(page());
    await until(async () => !(await isAudible(page())), "the page to pause");
    await stop(splitPage());
    await until(
      async () => !(await isAudible(splitPage())),
      "the other page to stop",
    );
    await play(page());
    await quietOn(splitTab());
    expect(await speakerIn(pageTab()).getAttribute("data-sound")).toBe(
      "playing",
    );

    const stopped = Date.now();
    await stop(page());
    await quietOn(pageTab());
    expect(Date.now() - stopped).toBeGreaterThanOrEqual(2000);
  });

  it("shows on its tab in the overview of all tabs, as it plays and once it's muted", async () => {
    // The overview labels each tab with a button titled with the tab's label
    const overviewTab = app.page.locator('button[title="Tone"]');
    const showOverview = () =>
      app.page.getByRole("button", { name: "View all tabs" }).click();
    const leaveOverview = async () => {
      await app.page.getByRole("button", { name: "Exit tab overview" }).click();
      await overviewTab.waitFor({ state: "detached" });
    };

    await play(page());
    await soundOf(pageTab(), "playing");

    await showOverview();
    const speaker = await soundOf(overviewTab, "playing");
    expect(await speaker.getAttribute("aria-label")).toBe("Playing");
    await leaveOverview();

    await speakerIn(pageTab()).click();
    await until(() => isMuted(page()), "the page to be muted");
    await stop(page());
    await until(async () => !(await isAudible(page())), "the page to stop");

    await showOverview();
    await soundOf(overviewTab, "muted");
    await leaveOverview();

    await speakerIn(pageTab()).click();
    await until(async () => !(await isMuted(page())), "the page to unmute");
    await quietOn(pageTab());
  });

  it("keeps a double click on its tab's speaker from renaming the tab", async () => {
    await play(page());
    await soundOf(pageTab(), "playing");

    await speakerIn(pageTab()).dispatchEvent("dblclick");
    await app.page.evaluate(() => new Promise(requestAnimationFrame));
    expect(await pageTab().locator("input").count()).toBe(0);

    await stop(page());
    await quietOn(pageTab());
  });

  it("shows on a tab the user named, since a name only replaces the tab's label", async () => {
    // A tab in the background swaps its button out once it shows, which would
    // split the double click across two buttons
    await showTab(pageTab());
    await labelOf(pageTab()).dblclick();
    const name = pageTab().locator("input");
    await name.fill("Radio");
    await name.press("Enter");
    await pageTab()
      .filter({ hasText: /^Radio/ })
      .waitFor();

    await play(page());
    await soundOf(labelOf(pageTab()), "playing");
    await speakerIn(pageTab()).click();
    await until(() => isMuted(page()), "the page to be muted");
    await soundOf(pageTab(), "muted");

    await speakerIn(pageTab()).click();
    await until(async () => !(await isMuted(page())), "the page to unmute");
    await stop(page());
    await quietOn(pageTab());
  });

  it("stays muted after its page goes quiet, and closes from its tab's close button, which the speaker leaves in place", async () => {
    await play(page());
    await (await soundOf(pageTab(), "playing")).click();
    await until(() => isMuted(page()), "the page to be muted");
    await play(splitPage());
    await soundOf(splitTab(), "playing");

    // Muted stays once the page goes quiet, so it doesn't come back loud. The
    // other page goes quiet after this one, so once its speaker goes, this
    // one's tab has heard that its page is quiet too.
    await stop(page());
    await until(async () => !(await isAudible(page())), "the page to stop");
    await stop(splitPage());
    await quietOn(splitTab());
    expect(await speakerIn(pageTab()).getAttribute("data-sound")).toBe("muted");

    await pageTab().hover();
    await slotIconIn(pageTab()).click();

    await until(
      async () => (await app.page.getByRole("tab").count()) === 1,
      "the tab to close",
    );
    expect(await page().count()).toBe(0);
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});
