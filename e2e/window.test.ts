import { afterAll, describe, expect, it } from "vitest";
import { type Conduit, launch, until } from "./app";
import {
  expectStartedAtPaneSize,
  expectStartedAtPaneWidth,
  zshenv,
} from "./shells";

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

describe("the window", () => {
  let app: Conduit;

  afterAll(() => app?.close());

  const bounds = (): Promise<Bounds> =>
    app.page.evaluate(() => ({
      x: window.screenX,
      y: window.screenY,
      width: window.outerWidth,
      height: window.outerHeight,
    }));
  /** The screen's work area, which the window has to stay inside. */
  const workArea = (): Promise<Bounds> =>
    app.page.evaluate(() => {
      // Chromium's, not in the DOM types.
      const { availLeft, availTop } = screen as Screen & {
        availLeft: number;
        availTop: number;
      };
      return {
        x: availLeft,
        y: availTop,
        width: screen.availWidth,
        height: screen.availHeight,
      };
    });

  /** Checks the window is at `target`, saying where it is if it isn't. */
  const isAt = (target: Bounds) => async () => {
    const now = await bounds();
    if (JSON.stringify(now) !== JSON.stringify(target)) {
      throw new Error(`it's at ${JSON.stringify(now)}`);
    }
    return true;
  };

  /** Moves and resizes the window, then quits and relaunches Conduit. */
  async function leaveAt(left: Bounds, name: string) {
    const rows = () => app.page.locator(".xterm-rows > div").count();
    const rowsBefore = await rows();
    await app.page.evaluate((target) => {
      // Chromium keeps a move from taking any of the window off the screen, so
      // it resizes first to fit where it's going.
      window.resizeTo(target.width, target.height);
      window.moveTo(target.x, target.y);
    }, left);
    await until(isAt(left), "the window to move and resize");
    // The terminal sizes its shell as it fits, so the size its workspace saves
    // on quit is the new one, which it restarts at.
    await until(
      async () => (await rows()) !== rowsBefore,
      "the terminal to fit the window",
    );
    await app.quit();
    app = await launch({ name, home: app.home });
  }

  it("reopens at the size and place it was left at", async () => {
    app = await launch({ name: "window", files: { ".zshenv": zshenv } });
    const area = await workArea();
    const width = Math.min(800, area.width - 80);
    const height = Math.min(500, area.height - 40);
    // Smaller than it opens at, and in the screen's corner rather than its
    // middle.
    const left: Bounds = {
      x: area.x + area.width - width - 40,
      y: area.y + area.height - height - 20,
      width,
      height,
    };
    await leaveAt(left, "window-reopened");

    expect(await bounds()).toEqual(left);
  });

  it("starts its first shell at its pane's size there", async () => {
    await expectStartedAtPaneSize(app, await app.terminal());
  });

  it("reopens filling the screen when it was left that way", async () => {
    const area = await workArea();
    await leaveAt(area, "window-reopened-filled");

    // macOS counts it as zoomed, which Electron restores as the window shows.
    await until(isAt(area), "the window to fill the screen");
    expect(await bounds()).toEqual(area);
  });

  it("starts its first shell no wider than its pane there", async () => {
    // Its shells start before it shows, at the size it was before it zoomed,
    // and grow with it.
    await expectStartedAtPaneWidth(app, await app.terminal());
  });

  it("reopens on the screen when the display it was left on is gone", async () => {
    await app.close();
    const gone = { left: 20_000, top: 20_000, right: 20_800, bottom: 20_500 };
    app = await launch({
      name: "window-display-gone",
      files: {
        "ud/Local State": JSON.stringify({
          windowStates: {
            main: {
              ...gone,
              workAreaLeft: 19_000,
              workAreaTop: 19_000,
              workAreaRight: 22_000,
              workAreaBottom: 22_000,
              maximized: false,
              fullscreen: false,
              kiosk: false,
            },
          },
        }),
      },
    });

    const [window, area] = [await bounds(), await workArea()];
    expect(window.x).toBeGreaterThanOrEqual(area.x);
    expect(window.y).toBeGreaterThanOrEqual(area.y);
    expect(window.x + window.width).toBeLessThanOrEqual(area.x + area.width);
    expect(window.y + window.height).toBeLessThanOrEqual(area.y + area.height);
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});
