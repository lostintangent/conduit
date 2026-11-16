import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

const png = Buffer.from("png bytes");

/** A page, or a pane's DevTools, as main sees it */
function fakeContents() {
  return Object.assign(new EventEmitter(), {
    capturePage: async () => ({ toPNG: () => png }),
    setDevToolsWebContents: vi.fn(),
    openDevTools: vi.fn(),
    inspectElement: vi.fn(),
    executeJavaScript: vi.fn(),
    // What a script in the page returns, like how far an element moved
    executeJavaScriptInIsolatedWorld: vi.fn(
      async (
        _world: number,
        _scripts: { code: string }[],
      ): Promise<unknown> => [0, 0],
    ),
    getZoomFactor: () => 2,
    getURL: () => "https://site.test/",
    session: {
      fetch: vi.fn(async (_url: string, _init?: RequestInit) => new Response()),
    },
  });
}
const contents = new Map<number, ReturnType<typeof fakeContents>>();
const contentsOf = (id: number) => {
  if (!contents.has(id)) contents.set(id, fakeContents());
  return contents.get(id)!;
};

vi.mock("electron", () => ({
  webContents: { fromId: (id: number) => contentsOf(id) },
}));

import service from "./service";

describe("browser service", () => {
  it("saves a screenshot of the page to a temporary PNG", async () => {
    const file = await service.saveScreenshot(1);

    expect(path.dirname(file)).toBe(tmpdir());
    expect(path.extname(file)).toBe(".png");
    expect(await fs.readFile(file)).toEqual(png);
    await fs.rm(file);
  });

  it("inspects the element at a point once a pane has loaded the page's DevTools", async () => {
    const page = contentsOf(2);
    const devTools = contentsOf(3);

    // Before then, the page can drop it, or Electron opens DevTools in a
    // window of its own
    await service.inspectElement(2, 10, 20, { x: 5, y: 10 });
    service.showDevTools(2, 3);
    // Past noting what's under the pointer, the page is left alone till then
    expect(page.executeJavaScriptInIsolatedWorld).toHaveBeenCalledOnce();
    expect(page.inspectElement).not.toHaveBeenCalled();
    devTools.emit("did-finish-load");
    await vi.waitFor(() =>
      expect(page.inspectElement).toHaveBeenCalledExactlyOnceWith(10, 20),
    );

    await service.inspectElement(2, 30, 40, { x: 15, y: 20 });
    expect(page.inspectElement).toHaveBeenLastCalledWith(30, 40);

    page.inspectElement.mockClear();
    devTools.emit("destroyed");
    await service.inspectElement(2, 50, 60, { x: 25, y: 30 });
    service.showDevTools(2, 4);
    expect(page.inspectElement).not.toHaveBeenCalled();
    contentsOf(4).emit("did-finish-load");
    await vi.waitFor(() =>
      expect(page.inspectElement).toHaveBeenCalledExactlyOnceWith(50, 60),
    );
  });

  it("finds the element under the pointer again once a DevTools pane has reshaped the page", async () => {
    const page = contentsOf(8);
    let noted: string | undefined;
    page.executeJavaScriptInIsolatedWorld
      // The page takes a moment to note what's under the pointer
      .mockImplementationOnce(
        (_world, [{ code }]) =>
          new Promise((resolve) =>
            setTimeout(() => {
              noted = code;
              resolve(undefined);
            }),
          ),
      )
      // And then scrolls it back into view, 150 of its pixels up
      .mockResolvedValueOnce([0, -150]);

    // The pane may only open once the page has noted it
    await service.inspectElement(8, 10, 900, { x: 5, y: 450 });
    expect(noted).toContain("elementFromPoint(5, 450)");

    service.showDevTools(8, 9);
    contentsOf(9).emit("did-finish-load");
    // At the page's zoom of 2
    await vi.waitFor(() =>
      expect(page.inspectElement).toHaveBeenCalledExactlyOnceWith(10, 600),
    );
  });

  it("keeps a page's DevTools pane once an older one is gone", async () => {
    const page = contentsOf(5);
    service.showDevTools(5, 6);
    contentsOf(6).emit("did-finish-load");
    service.showDevTools(5, 7);
    contentsOf(7).emit("did-finish-load");
    contentsOf(6).emit("destroyed");

    await service.inspectElement(5, 10, 20, { x: 5, y: 10 });
    expect(page.inspectElement).toHaveBeenCalledExactlyOnceWith(10, 20);
  });

  it("fetches a page's icons through its session, as data URLs, keeping only the images", async () => {
    const page = contentsOf(6);
    const responses: Record<string, () => Promise<Response>> = {
      "https://site.test/icon.svg": async () =>
        new Response("<svg/>", {
          headers: { "content-type": "image/svg+xml; charset=utf-8" },
        }),
      "https://site.test/gone.png": async () =>
        new Response("", { status: 404 }),
      // A site without a favicon.ico can answer with a page
      "https://site.test/favicon.ico": async () =>
        new Response("<html>", { headers: { "content-type": "text/html" } }),
      "https://down.test/icon.png": () => Promise.reject(new Error("offline")),
    };
    page.session.fetch.mockImplementation((url) => responses[url]());

    const icons = await service.fetchIcons(6, [
      ...Object.keys(responses),
      "data:image/png;base64,AAAA",
    ]);

    expect(icons).toEqual([
      `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
    ]);
    expect(page.session.fetch).toHaveBeenCalledTimes(4);
  });
});
