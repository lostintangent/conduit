import { appPreferencesAtom } from "@/store/atoms";
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
export const useAppPreferences = () => {
  const [preferences, setPreferences] = useAtom(appPreferencesAtom);

  useEffect(() => {
    const loadPreferences = async () => {
      const preferences = await api.getPreferences();
      setPreferences(preferences);
    };

    loadPreferences();

    const unsubscribeTabPosition = api.onTabPositionChange((position) =>
      setPreferences((current) => ({
        ...current,
        tabPosition: position,
      }))
    );

    const unsubscribeAlwaysShow = api.onAlwaysShowTabStripChange((value) =>
      setPreferences((current) => ({
        ...current,
        alwaysShowTabStrip: value === true,
      }))
    );

    const unsubscribeOverviewRuler = api.onShowOverviewRulerChange((value) =>
      setPreferences((current) => ({
        ...current,
        showOverviewRuler: value === true,
      }))
    );

    return () => {
      unsubscribeTabPosition();
      unsubscribeAlwaysShow();
      unsubscribeOverviewRuler();
    };
  }, []);

  const recordCommandHistoryEntry = useCallback(
    async (command: string) => {
      const trimmed = command.trim();
      if (!trimmed) {
        return;
      }

      setPreferences((current) => ({
        ...current,
        commandHistory: appendCommandToHistory(current.commandHistory, trimmed),
      }));

      const updatedHistory = await api.addCommandHistoryEntry(trimmed);
      setPreferences((current) => ({
        ...current,
        commandHistory: normalizeCommandHistory(updatedHistory),
      }));
    },
    [setPreferences]
  );

  const removeCommandHistoryEntry = useCallback(
    async (command: string) => {
      const trimmed = command.trim();
      if (!trimmed) {
        return;
      }

      setPreferences((current) => ({
        ...current,
        commandHistory: current.commandHistory.filter(
          (entry) => entry !== trimmed
        ),
      }));

      const updatedHistory = await api.removeCommandHistoryEntry(trimmed);
      setPreferences((current) => ({
        ...current,
        commandHistory: normalizeCommandHistory(updatedHistory),
      }));
    },
    [setPreferences]
  );

  return {
    ...preferences,
    recordCommandHistoryEntry,
    removeCommandHistoryEntry,
  };
};
