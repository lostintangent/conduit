import { app } from "electron";
import { readFileSync, renameSync } from "node:fs";
import path from "node:path";
import type { openSettings } from "@features/settings/main/settings";
import type { UserSettings } from "@features/settings/model";
import { writeJsonFile } from "../../../main/atomicWrite";
import type { BrowserLibrary, BrowserPage } from "../model";

/** History keeps this many pages, newest first. */
const HISTORY_LIMIT = 200;

// The pages history keeps. The app's own, like a blank pane, an error page or
// DevTools, aren't ones to go back to.
const RECORDED_PROTOCOLS = new Set(["http:", "https:", "file:"]);

type Library = ReturnType<typeof openLibrary>;

/** What older versions kept in settings.json */
type LegacySettings = { urlHistory?: unknown; starredPages?: unknown };

/**
 * The browser's favorites and history in `browser.json`. It's read on first
 * use and kept in memory. Visits save a moment later, once for a burst of
 * them, and the user's own changes save at once.
 */
export function openLibrary(filePath: () => string, saveDelayMs = 1000) {
  let current: BrowserLibrary | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<void> = Promise.resolve();

  function get(): BrowserLibrary {
    current ??= read(filePath());
    return current;
  }

  function save(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    saving = writeJsonFile(filePath(), get());
    return saving;
  }

  function saveSoon() {
    timer ??= setTimeout(() => {
      save().catch((error) =>
        console.error("[Browser] Couldn't save history:", error),
      );
    }, saveDelayMs);
  }

  /** Saves `change` at once, and returns the library with it. */
  async function saveChange(
    change: (library: BrowserLibrary) => BrowserLibrary,
  ): Promise<BrowserLibrary> {
    current = change(get());
    await save();
    return get();
  }

  return {
    get,

    /**
     * Puts the page at the top of history, and says whether it did. History
     * leaves out the app's own pages.
     */
    visit(page: BrowserPage): boolean {
      if (!isRecorded(page.url)) return false;
      const { favorites, history } = get();
      current = {
        favorites,
        history: [
          { ...page, visitedAt: Date.now() },
          ...history.filter(({ url }) => url !== page.url),
        ].slice(0, HISTORY_LIMIT),
      };
      saveSoon();
      return true;
    },

    /** Gives a visited page its new title, and says whether it changed. */
    retitle({ url, title }: BrowserPage): boolean {
      const { favorites, history } = get();
      if (
        !history.some((entry) => entry.url === url && entry.title !== title)
      ) {
        return false;
      }
      current = {
        favorites,
        history: history.map((entry) =>
          entry.url === url ? { ...entry, title } : entry,
        ),
      };
      saveSoon();
      return true;
    },

    addFavorite(page: BrowserPage) {
      const url = page.url.trim();
      return saveChange(({ favorites, history }) => ({
        favorites: [
          { url, title: page.title.trim() || url },
          ...favorites.filter((favorite) => favorite.url !== url),
        ],
        history,
      }));
    },

    removeFavorite(url: string) {
      return saveChange(({ favorites, history }) => ({
        favorites: favorites.filter((favorite) => favorite.url !== url),
        history,
      }));
    },

    removeFromHistory(url: string) {
      return saveChange(({ favorites, history }) => ({
        favorites,
        history: history.filter((entry) => entry.url !== url),
      }));
    },

    clearHistory() {
      return saveChange(({ favorites }) => ({ favorites, history: [] }));
    },

    /** Adds pages after the ones the library has, skipping those it has. */
    addOlder(older: BrowserLibrary) {
      const after = <Page extends BrowserPage>(pages: Page[], more: Page[]) => [
        ...pages,
        ...more.filter(({ url }) => !pages.some((page) => page.url === url)),
      ];
      return saveChange(({ favorites, history }) => ({
        favorites: after(favorites, older.favorites),
        history: after(history, older.history).slice(0, HISTORY_LIMIT),
      }));
    },

    /** Saves visits still waiting to, as when the app quits. */
    flush(): Promise<void> {
      return timer ? save() : saving.catch(() => {});
    },
  };
}

function isRecorded(url: string) {
  try {
    return RECORDED_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

const isPage = (value: unknown): value is BrowserPage =>
  typeof (value as BrowserPage)?.url === "string" &&
  typeof (value as BrowserPage)?.title === "string";

/**
 * The library in `file`, or an empty one when there's none yet. A file that
 * isn't a library is moved aside, so saving can't throw it away.
 */
function read(file: string): BrowserLibrary {
  let contents: string;
  try {
    contents = readFileSync(file, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[Browser] Couldn't read browser.json:", error);
    }
    return { favorites: [], history: [] };
  }

  try {
    const saved = JSON.parse(contents);
    if (!Array.isArray(saved?.favorites) || !Array.isArray(saved?.history)) {
      throw new Error("it doesn't have favorites and history lists");
    }
    return {
      favorites: saved.favorites.filter(isPage),
      history: saved.history.filter(
        (entry: unknown) =>
          isPage(entry) && typeof (entry as any).visitedAt === "number",
      ),
    };
  } catch (error) {
    const aside = `${file}.corrupt-${Date.now()}`;
    console.error(
      `[Browser] Starting with no history or favorites, and moving browser.json to ${path.basename(aside)}:`,
      error,
    );
    try {
      renameSync(file, aside);
    } catch (renameError) {
      console.error("[Browser] Couldn't move browser.json:", renameError);
    }
    return { favorites: [], history: [] };
  }
}

/**
 * Moves the history and favorites older versions kept in settings.json into
 * the library, after any it has, and then out of settings.json.
 */
export async function moveFromSettings(
  library: Library,
  settings: ReturnType<typeof openSettings>,
): Promise<void> {
  const { urlHistory, starredPages } = settings.get() as UserSettings &
    LegacySettings;
  if (urlHistory === undefined && starredPages === undefined) return;

  const visitedAt = Date.now();
  await library.addOlder({
    favorites: Array.isArray(starredPages)
      ? starredPages
          .filter((page) => typeof page?.url === "string")
          .map(({ url, title }) => ({
            url,
            title: typeof title === "string" && title ? title : url,
          }))
      : [],
    history: Array.isArray(urlHistory)
      ? urlHistory
          .filter((url) => typeof url === "string")
          .map((url) => ({ url, title: url, visitedAt }))
      : [],
  });
  await settings.update((): Partial<UserSettings> & LegacySettings => ({
    urlHistory: undefined,
    starredPages: undefined,
  }));
}

export const library = openLibrary(() =>
  path.join(app.getPath("home"), ".conduit", "browser.json"),
);
