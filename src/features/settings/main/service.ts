import { setDotfilesRepo } from "@features/dotfiles/main";
import type { UserSettings } from "../model";
import { settings } from "./settings";

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
};

export default service;

declare module "@shared/rpc" {
  interface Services {
    settings: typeof service;
  }
}
