import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, inWebview, launch, newHome, until } from "./app";

let server: http.Server;
let origin: string;

beforeAll(async () => {
  server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(
      "<!doctype html><title>Page</title><body style='background: rgb(255, 0, 255)'>",
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

describe("a hyper terminal being dragged", () => {
  let app: Conduit;

  beforeAll(async () => {
    const home = newHome();
    const project = path.join(home, "proj");
    // An editor on the left, wide enough to show its tree and editor side by
    // side, and a page on the right
    const tab = {
      id: "Split",
      name: "Split",
      activePaneId: "Split-editor",
      panes: [
        {
          id: "Split-editor",
          type: "editor",
          cwd: project,
          file: path.join(project, "notes.txt"),
        },
        { id: "Split-page", type: "browser", url: `${origin}/` },
      ],
      layout: {
        id: "Split-layout",
        type: "split",
        direction: "row",
        children: [
          {
            id: "Split-editor-node",
            type: "pane",
            paneId: "Split-editor",
            size: 62,
          },
          {
            id: "Split-page-node",
            type: "pane",
            paneId: "Split-page",
            size: 38,
          },
        ],
      },
    };
    app = await launch({
      name: "hyper-terminal",
      home,
      files: {
        "proj/notes.txt": Array.from(
          { length: 40 },
          (_, line) => `Line ${line + 1} of some notes to select`,
        ).join("\n"),
        ".conduit/workspaces.json": JSON.stringify({
          workspaces: [],
          untitled: { lastModified: 0, activeTabId: "Split", tabs: [tab] },
        }),
      },
    });
  });

  afterAll(() => app?.close());

  const webview = () => app.page.locator("webview#Split-page");
  const editor = () =>
    app.page
      .getByTestId("editor-pane")
      .locator(".monaco-editor")
      .filter({ visible: true });

  /** Whether the window shows the page's magenta at `point`, not covered or tinted */
  async function showsPage(point: { x: number; y: number }): Promise<boolean> {
    const png = await app.page.screenshot();
    return app.page.evaluate(
      async ({ base64, x, y }) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const image = await createImageBitmap(new Blob([bytes]));
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const scale = devicePixelRatio;
        const [r, g, b] = context.getImageData(
          Math.floor(x * scale),
          Math.floor(y * scale),
          1,
          1,
        ).data;
        return r > 200 && g < 60 && b > 200;
      },
      { base64: png.toString("base64"), ...point },
    );
  }

  // The pointer gets ahead of the title bar until the hyper terminal catches
  // up with it, and it mustn't reach what's behind meanwhile
  it("keeps the pointer from the panes behind it, which look and act the same", async () => {
    await until(
      async () => (await inWebview(webview(), "document.title")) === "Page",
      "the page to load",
    );
    await until(
      async () =>
        (await editor().locator(".view-line").allTextContents()).length > 10,
      "the notes in the editor",
    );
    await inWebview(
      webview(),
      `window.pointed = 0;
      for (const type of ["mousemove", "mouseup", "pointermove", "pointerup"]) {
        addEventListener(type, () => pointed++, true);
      }`,
    );
    const page = (await webview().boundingBox())!;
    const notes = (await editor().boundingBox())!;
    // Where the hyper terminal never is, to see the page itself
    const corner = {
      x: page.x + page.width - 20,
      y: page.y + page.height - 20,
    };

    await app.page.getByRole("button", { name: "Open hyper terminal" }).click();
    const minimize = app.page.getByRole("button", { name: "Minimize" });
    const bar = (await minimize.boundingBox())!;
    await app.page.mouse.move(bar.x + 100, bar.y + bar.height / 2);
    await app.page.mouse.down();
    // Over the top of the notes, then down over the page, out of reach of the
    // title bar until it catches up
    await app.page.mouse.move(notes.x + notes.width / 2, notes.y + 40);
    const over = {
      x: Math.round(page.x + 40),
      y: Math.round(page.y + page.height - 150),
    };
    await app.page.mouse.move(over.x, over.y);
    // Neither the drag's cover nor a selection shows over the page
    expect(await showsPage(corner)).toBe(true);
    await app.page.mouse.up();

    // The drag kept up, so the bar ended under the pointer
    const moved = (await minimize.boundingBox())!;
    expect(moved.x).toBeCloseTo(over.x - 100, 0);
    expect(await inWebview(webview(), "pointed")).toBe(0);
    expect(await app.page.evaluate(() => getSelection()!.toString())).toBe("");
  });
});
