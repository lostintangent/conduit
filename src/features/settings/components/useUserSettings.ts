import { enqueueNotification } from "@/store/actions/notifications";
import { userSettingsAtom } from "@/store/atoms";
import { useAtom } from "@tanstack/react-store";
import { useEffect } from "react";
import type { BrowserPage, UserSettings } from "../model";

const api = () => window.conduit.settings;

/** Shows a failed save, for callers that don't wait for one. */
export function notifySettingsError(error: unknown) {
  enqueueNotification({
    kind: "error",
    message: "Couldn't update settings",
    details: error instanceof Error ? error.message : String(error),
  });
}

/**
 * Loads settings into `userSettingsAtom`, and keeps them current when
 * settings.json changes outside the app. The app calls this once.
 */
export function useSettingsSync() {
  useEffect(() => {
    const unsubscribe = api().on("changed", userSettingsAtom.set);
    api().get().then(userSettingsAtom.set);
    return unsubscribe;
  }, []);
}

export function useUserSettings() {
  const [userSettings, setUserSettings] = useAtom(userSettingsAtom);

  function updateSetting<K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) {
    setUserSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function updateSettings(updates: Partial<UserSettings>) {
    setUserSettings(await api().update(updates));
  }

  // The browser doesn't wait for these, so they show a failure themselves.
  function save<K extends keyof UserSettings>(
    key: K,
    saved: Promise<UserSettings[K]>,
  ) {
    return saved
      .then((value) => updateSetting(key, value))
      .catch(notifySettingsError);
  }

  return {
    ...userSettings,
    updateSettings,

    // Browser pane state management
    addUrlToHistory: (url: string) =>
      save("urlHistory", api().addUrlToHistory(url)),
    removeUrlFromHistory: (url: string) =>
      save("urlHistory", api().removeUrlFromHistory(url)),
    addStarredPage: (page: BrowserPage) =>
      save("starredPages", api().addStarredPage(page)),
    removeStarredPage: (url: string) =>
      save("starredPages", api().removeStarredPage(url)),
  };
}
