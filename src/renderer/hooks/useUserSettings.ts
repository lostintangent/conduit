import { userSettingsAtom } from "@/store/atoms";
import { useAtom } from "jotai";
import { useEffect } from "react";

const api = window.conduit;

export function useUserSettings() {
  const [userSettings, setUserSettings] = useAtom(userSettingsAtom);

  function updateSetting<K extends keyof typeof userSettings>(
    key: K,
    value: (typeof userSettings)[K],
  ) {
    setUserSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  // Load initial settings
  useEffect(() => {
    api.getSettings().then(setUserSettings);
  }, []);

  async function updateCommandHistory(
    command: string,
    action: "add" | "remove",
  ) {
    const commandHistory =
      action === "add"
        ? await api.addCommandHistoryEntry(command)
        : await api.removeCommandHistoryEntry(command);

    updateSetting("commandHistory", commandHistory);
  }

  async function updateUrlHistory(url: string) {
    const urlHistory = await api.addUrlToHistory(url);
    updateSetting("urlHistory", urlHistory);
  }

  async function removeUrlFromHistory(url: string) {
    const urlHistory = await api.removeUrlFromHistory(url);
    updateSetting("urlHistory", urlHistory);
  }

  async function updateSettings(updates: Partial<typeof userSettings>) {
    const newSettings = await api.updateSettings(updates);
    setUserSettings(newSettings);
  }

  async function addStarredPage(
    page: (typeof userSettings)["starredPages"][number],
  ) {
    const starredPages = await api.addStarredPage(page);
    updateSetting("starredPages", starredPages);
  }

  async function removeStarredPage(url: string) {
    const starredPages = await api.removeStarredPage(url);
    updateSetting("starredPages", starredPages);
  }

  return {
    ...userSettings,
    updateSettings,

    // Command history management (for the terminal in the command palette)
    addCommandHistoryEntry: (command: string) =>
      updateCommandHistory(command, "add"),
    removeCommandHistoryEntry: (command: string) =>
      updateCommandHistory(command, "remove"),

    // Browser pane state management
    addUrlToHistory: (url: string) => updateUrlHistory(url),
    removeUrlFromHistory: (url: string) => removeUrlFromHistory(url),
    addStarredPage,
    removeStarredPage,
  };
}
