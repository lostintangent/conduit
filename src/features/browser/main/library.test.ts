import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openSettings } from "@features/settings/main/settings";
import { moveFromSettings, openLibrary } from "./library";

vi.mock("electron", () => ({ app: {} }));

describe("the browser's library", () => {
  let home: string;
  let file: string;
  let library: ReturnType<typeof openLibrary>;

  const onDisk = async () => JSON.parse(await readFile(file, "utf-8"));
  const visited = () => library.get().history.map(({ url }) => url);

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), "conduit-library-"));
    await mkdir(path.join(home, ".conduit"));
    file = path.join(home, ".conduit", "browser.json");
    library = openLibrary(() => file, 10);
  });

  afterEach(async () => {
    await library.flush();
    await rm(home, { recursive: true, force: true });
  });

  it("puts the page the user visits at the top of history, once", () => {
    library.visit({ url: "https://a.com/", title: "A" });
    library.visit({ url: "https://b.com/", title: "B" });
    library.visit({ url: "https://a.com/", title: "A again" });

    expect(library.get().history).toEqual([
      {
        url: "https://a.com/",
        title: "A again",
        visitedAt: expect.any(Number),
      },
      { url: "https://b.com/", title: "B", visitedAt: expect.any(Number) },
    ]);
  });

  it("keeps the latest 200 pages", () => {
    for (let page = 0; page <= 200; page++) {
      library.visit({ url: `https://a.com/${page}`, title: "" });
    }

    expect(visited()).toHaveLength(200);
    expect(visited()[0]).toBe("https://a.com/200");
    expect(visited()).not.toContain("https://a.com/0");
  });

  it("leaves the app's own pages out of history", () => {
    for (const url of [
      "about:blank",
      "devtools://devtools/bundled/devtools_app.html",
      "chrome-error://chromewebdata/",
      "data:text/html,hi",
    ]) {
      expect(library.visit({ url, title: "" })).toBe(false);
    }
    expect(library.visit({ url: "file:///tmp/report.html", title: "" })).toBe(
      true,
    );

    expect(visited()).toEqual(["file:///tmp/report.html"]);
  });

  it("gives a visited page the title it gets once it loads", () => {
    library.visit({ url: "https://a.com/", title: "a.com" });

    expect(library.retitle({ url: "https://a.com/", title: "A" })).toBe(true);
    expect(library.retitle({ url: "https://a.com/", title: "A" })).toBe(false);
    expect(library.retitle({ url: "https://b.com/", title: "B" })).toBe(false);
    expect(library.get().history).toMatchObject([
      { url: "https://a.com/", title: "A" },
    ]);
  });

  it("saves visits a moment later, once for a burst of them", async () => {
    library.visit({ url: "https://a.com/", title: "A" });
    library.visit({ url: "https://b.com/", title: "B" });
    await expect(readFile(file)).rejects.toThrow("ENOENT");

    await vi.waitFor(async () =>
      expect((await onDisk()).history).toMatchObject([
        { url: "https://b.com/" },
        { url: "https://a.com/" },
      ]),
    );
  });

  it("saves visits that are waiting when the app quits", async () => {
    library = openLibrary(() => file, 60_000);
    library.visit({ url: "https://a.com/", title: "A" });

    await library.flush();

    expect((await onDisk()).history).toMatchObject([{ url: "https://a.com/" }]);
  });

  it("saves a favorite at once, at the top, once", async () => {
    await library.addFavorite({ url: "https://a.com/", title: "A" });
    await library.addFavorite({ url: " https://b.com/ ", title: " " });
    const saved = await library.addFavorite({
      url: "https://a.com/",
      title: "A again",
    });

    const favorites = [
      { url: "https://a.com/", title: "A again" },
      { url: "https://b.com/", title: "https://b.com/" },
    ];
    expect(saved.favorites).toEqual(favorites);
    expect((await onDisk()).favorites).toEqual(favorites);
  });

  it("removes a favorite or a page from history, and clears history but not favorites", async () => {
    library.visit({ url: "https://a.com/", title: "A" });
    library.visit({ url: "https://b.com/", title: "B" });
    await library.addFavorite({ url: "https://a.com/", title: "A" });
    await library.addFavorite({ url: "https://b.com/", title: "B" });

    await library.removeFavorite("https://a.com/");
    await library.removeFromHistory("https://b.com/");
    expect(await onDisk()).toMatchObject({
      favorites: [{ url: "https://b.com/" }],
      history: [{ url: "https://a.com/" }],
    });

    await library.clearHistory();
    expect(await onDisk()).toMatchObject({
      favorites: [{ url: "https://b.com/" }],
      history: [],
    });
  });

  it("reads what it saved on the next launch", async () => {
    library.visit({ url: "https://a.com/", title: "A" });
    await library.addFavorite({ url: "https://b.com/", title: "B" });

    expect(openLibrary(() => file).get()).toEqual(library.get());
  });

  it("moves aside a browser.json that doesn't parse, rather than save over it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await writeFile(file, '{ "favorites": [');

    expect(library.get()).toEqual({ favorites: [], history: [] });
    const files = await readdir(path.join(home, ".conduit"));
    expect(files).toEqual([expect.stringMatching(/^browser\.json\.corrupt-/)]);
  });

  describe("moving history and favorites out of settings.json", () => {
    const settingsFile = () => path.join(home, ".conduit", "settings.json");

    it("adds them to the library and removes them from settings.json", async () => {
      library.visit({ url: "https://new.com/", title: "New" });
      await writeFile(
        settingsFile(),
        JSON.stringify({
          theme: "light",
          urlHistory: ["https://typed.com/", "https://new.com/", 3],
          starredPages: [
            { url: "https://starred.com/", title: "Starred" },
            "x",
          ],
        }),
      );
      const settings = openSettings(() => home);

      await moveFromSettings(library, settings);

      expect(await onDisk()).toEqual({
        favorites: [{ url: "https://starred.com/", title: "Starred" }],
        history: [
          {
            url: "https://new.com/",
            title: "New",
            visitedAt: expect.any(Number),
          },
          {
            url: "https://typed.com/",
            title: "https://typed.com/",
            visitedAt: expect.any(Number),
          },
        ],
      });
      expect(JSON.parse(await readFile(settingsFile(), "utf-8"))).toEqual({
        theme: "light",
      });
    });

    it("leaves settings.json alone once they've moved", async () => {
      await writeFile(settingsFile(), '{"theme": "light"}');

      await moveFromSettings(
        library,
        openSettings(() => home),
      );

      expect(await readFile(settingsFile(), "utf-8")).toBe(
        '{"theme": "light"}',
      );
      await expect(readFile(file)).rejects.toThrow("ENOENT");
    });
  });
});
