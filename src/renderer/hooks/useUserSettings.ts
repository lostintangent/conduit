import { userSettingsAtom } from "@/store/atoms";
import { useAtom } from "jotai";
import { useEffect } from "react";

const api = window.conduit;

export function useUserSettings() {
  const [userSettings, setUserSettings] = useAtom(userSettingsAtom);

  async function loadUserSettings() {
    const settings = await api.getSettings();
    setUserSettings(settings);
  }

  function updateSetting<K extends keyof typeof userSettings>(
    key: K,
    value: (typeof userSettings)[K],
  ) {
    setUserSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  // Load initial settings and set up listeners for changes
  useEffect(() => {
    loadUserSettings();

    const eventListeners = [
      api.onTabPositionChange((position) =>
        updateSetting("tabPosition", position),
      ),
      api.onAlwaysShowTabsChange((value) =>
        updateSetting("alwaysShowTabs", value === true),
      ),
      api.onShowTerminalRulerChange((value) =>
        updateSetting("showTerminalRuler", value === true),
      ),
      api.onUseConduitAsEditorChange((value) =>
        updateSetting("useConduitAsEditor", value === true),
      ),
    ];

    return () => eventListeners.forEach((unsubscribe) => unsubscribe());
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

  async function updateSettings(updates: Partial<typeof userSettings>) {
    const newSettings = await api.updateSettings(updates);
    setUserSettings(newSettings);
  }

  return {
    ...userSettings,

    updateSettings,

    addCommandHistoryEntry: (command: string) =>
      updateCommandHistory(command, "add"),

    removeCommandHistoryEntry: (command: string) =>
      updateCommandHistory(command, "remove"),

    addUrlToHistory: (url: string) => updateUrlHistory(url),
  };
}
