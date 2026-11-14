import { setDotfilesRepo } from "@features/dotfiles/main";
import type { BrowserPage, UserSettings } from "../model";
import { settings } from "./settings";

/** The browser keeps this many recent URLs, newest first. */
const HISTORY_LIMIT = 5;

const service = {
  get: () => settings.get(),

  async update(updates: Partial<UserSettings>) {
    const next = await settings.update(() => updates);
    // Only a save that sets the repo moves it. One pulled into settings.json
    // waits for the next launch, so saving another setting can't reclone it.
    if ("dotfilesRepo" in updates) {
      await setDotfilesRepo(next.dotfilesRepo);
    }
    return next;
  },

  async addUrlToHistory(url: string) {
    const trimmed = url.trim();
    const next = await settings.update(({ urlHistory }) => ({
      urlHistory: [
        trimmed,
        ...urlHistory.filter((entry) => entry !== trimmed),
      ].slice(0, HISTORY_LIMIT),
    }));
    return next.urlHistory;
  },

  async removeUrlFromHistory(url: string) {
    const trimmed = url.trim();
    const next = await settings.update(({ urlHistory }) => ({
      urlHistory: urlHistory.filter((entry) => entry !== trimmed),
    }));
    return next.urlHistory;
  },

  async addStarredPage(page: BrowserPage) {
    const url = page.url.trim();
    const next = await settings.update(({ starredPages }) => ({
      starredPages: [
        { url, title: page.title.trim() || url },
        ...starredPages.filter((entry) => entry.url !== url),
      ],
    }));
    return next.starredPages;
  },

  async removeStarredPage(url: string) {
    const trimmed = url.trim();
    const next = await settings.update(({ starredPages }) => ({
      starredPages: starredPages.filter((entry) => entry.url !== trimmed),
    }));
    return next.starredPages;
  },
};

export default service;

declare module "@shared/rpc" {
  interface Services {
    settings: typeof service;
  }
}
