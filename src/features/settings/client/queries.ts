import {
  mutationOptions,
  type QueryClient,
  queryOptions,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { queryClient } from "@/query";
import type { BrowserPage, UserSettings } from "../model";

export const settingsKeys = { all: ["settings"] as const };

/**
 * The user's settings. main.tsx loads them before the first render, and only
 * the mutations below and installSettingsQueryBridge change them after that.
 */
export const settingsQuery = queryOptions({
  queryKey: settingsKeys.all,
  queryFn: () => window.conduit.settings.get(),
  staleTime: Infinity,
  gcTime: Infinity,
});

/**
 * The settings, or the part of them `select` returns. A component re-renders
 * only when that part changes. Settings load before the first render, so
 * this doesn't suspend.
 */
export function useSettings<Selected = UserSettings>(
  select?: (settings: UserSettings) => Selected,
): Selected {
  return useSuspenseQuery({ ...settingsQuery, select }).data;
}

/** The settings, for code outside React. */
export function getSettings(): UserSettings {
  const settings = queryClient.getQueryData(settingsQuery.queryKey);
  if (!settings) throw new Error("Settings were read before they loaded");
  return settings;
}

/** Applies edits made to settings.json outside the app. */
export function installSettingsQueryBridge(client: QueryClient): () => void {
  return window.conduit.settings.on("changed", (settings) =>
    client.setQueryData(settingsQuery.queryKey, settings),
  );
}

/** Main applies settings writes one at a time, so they queue in one scope. */
function write(name: string) {
  return {
    mutationKey: [...settingsKeys.all, name],
    scope: { id: "settings" },
    meta: { errorMessage: "Couldn't update settings" },
  };
}

/** A write that saves one field, and shows the field main replies with. */
function saveField<Key extends keyof UserSettings, Variables>(
  name: string,
  key: Key,
  save: (variables: Variables) => Promise<UserSettings[Key]>,
) {
  return mutationOptions({
    ...write(name),
    mutationFn: save,
    onSuccess: (value, _variables, _onMutateResult, { client }) => {
      client.setQueryData(
        settingsQuery.queryKey,
        (settings) => settings && { ...settings, [key]: value },
      );
    },
  });
}

export const settingsMutations = {
  /**
   * Shows the change at once and saves it. A failed save re-reads main's
   * settings rather than putting back what was there before, because a later
   * change may already be showing.
   */
  update: () =>
    mutationOptions({
      ...write("update"),
      mutationFn: (updates: Partial<UserSettings>) =>
        window.conduit.settings.update(updates),
      onMutate: (updates, { client }) => {
        client.setQueryData(
          settingsQuery.queryKey,
          (settings) => settings && { ...settings, ...updates },
        );
      },
      onSuccess: (settings, _updates, _onMutateResult, { client }) => {
        // A write still waiting has already shown its change, and this reply
        // doesn't have it yet. That write's own reply will.
        if (client.isMutating({ mutationKey: settingsKeys.all }) === 1) {
          client.setQueryData(settingsQuery.queryKey, settings);
        }
      },
      // Re-read even with nothing showing settings, since getSettings reads
      // the cache too
      onError: (_error, _updates, _onMutateResult, { client }) =>
        client.invalidateQueries({
          queryKey: settingsKeys.all,
          refetchType: "all",
        }),
    }),

  addUrlToHistory: () =>
    saveField("addUrlToHistory", "urlHistory", (url: string) =>
      window.conduit.settings.addUrlToHistory(url),
    ),

  removeUrlFromHistory: () =>
    saveField("removeUrlFromHistory", "urlHistory", (url: string) =>
      window.conduit.settings.removeUrlFromHistory(url),
    ),

  addStarredPage: () =>
    saveField("addStarredPage", "starredPages", (page: BrowserPage) =>
      window.conduit.settings.addStarredPage(page),
    ),

  removeStarredPage: () =>
    saveField("removeStarredPage", "starredPages", (url: string) =>
      window.conduit.settings.removeStarredPage(url),
    ),
};
