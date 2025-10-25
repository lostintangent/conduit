import { userSettingsAtom } from "@/store/atoms";
import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";

const normalizeCommandHistory = (history: unknown): string[] => {
  if (!Array.isArray(history)) {
    return [];
  }

  const normalized: string[] = [];

  for (const entry of history) {
    if (typeof entry !== "string") {
      continue;
    }

    const trimmed = entry.trim();
    if (!trimmed || normalized.includes(trimmed)) {
      continue;
    }

    normalized.push(trimmed);

    if (normalized.length === 5) {
      break;
    }
  }

  return normalized;
};

const appendCommandToHistory = (
  history: string[],
  command: string
): string[] => {
  const trimmed = command.trim();
  if (!trimmed) {
    return history;
  }

  const next = [trimmed, ...history.filter((entry) => entry !== trimmed)];
  return next.slice(0, 5);
};

const api = window.conduit;
export function useUserSettings() {
  const [userSettings, setUserSettings] = useAtom(userSettingsAtom);

  useEffect(() => {
    const loadUserSettings = async () => {
      const userSettings = await api.getSettings();
      setUserSettings(userSettings);
    };

    loadUserSettings();

    const unsubscribeTabPosition = api.onTabPositionChange((position) =>
      setUserSettings((current) => ({
        ...current,
        tabPosition: position,
      }))
    );

    const unsubscribeAlwaysShow = api.onAlwaysShowTabsChange((value) =>
      setUserSettings((current) => ({
        ...current,
        alwaysShowTabs: value === true,
      }))
    );

    const unsubscribeTerminalRuler = api.onShowTerminalRulerChange((value) =>
      setUserSettings((current) => ({
        ...current,
        showTerminalRuler: value === true,
      }))
    );

    return () => {
      unsubscribeTabPosition();
      unsubscribeAlwaysShow();
      unsubscribeTerminalRuler();
    };
  }, []);

  const recordCommandHistoryEntry = useCallback(
    async (command: string) => {
      const trimmed = command.trim();
      if (!trimmed) {
        return;
      }

      setUserSettings((current) => ({
        ...current,
        commandHistory: appendCommandToHistory(current.commandHistory, trimmed),
      }));

      const updatedHistory = await api.addCommandHistoryEntry(trimmed);
      setUserSettings((current) => ({
        ...current,
        commandHistory: normalizeCommandHistory(updatedHistory),
      }));
    },
    [setUserSettings]
  );

  const removeCommandHistoryEntry = useCallback(
    async (command: string) => {
      const trimmed = command.trim();
      if (!trimmed) {
        return;
      }

      setUserSettings((current) => ({
        ...current,
        commandHistory: current.commandHistory.filter(
          (entry) => entry !== trimmed
        ),
      }));

      const updatedHistory = await api.removeCommandHistoryEntry(trimmed);
      setUserSettings((current) => ({
        ...current,
        commandHistory: normalizeCommandHistory(updatedHistory),
      }));
    },
    [setUserSettings]
  );

  return {
    ...userSettings,
    recordCommandHistoryEntry,
    removeCommandHistoryEntry,
  };
};
