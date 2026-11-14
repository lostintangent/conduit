import { createQueryClient } from "@/query";
import { settingsQuery } from "@features/settings/client/queries";
import { defaultSettings, type UserSettings } from "@features/settings/model";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as rtl from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

/** Settings as main sends them: the defaults, with `overrides`. */
export function testSettings(
  overrides: Partial<UserSettings> = {},
): UserSettings {
  return { ...defaultSettings, homeDirectory: "/Users/tester", ...overrides };
}

/**
 * Loads `testSettings(overrides)` into `queryClient`, as main.tsx does before
 * the first render, so a refetch reads `window.conduit.settings.get`. Code
 * outside React, like getSettings, reads the app's `queryClient` from
 * `@/query`, so seed that one for it.
 */
export function seedSettings(
  queryClient: QueryClient,
  overrides?: Partial<UserSettings>,
): QueryClient {
  const { queryKey, ...options } = settingsQuery;
  queryClient.setQueryDefaults(queryKey, options);
  queryClient.setQueryData(queryKey, testSettings(overrides));
  return queryClient;
}

/**
 * A wrapper providing `queryClient`, by default a fresh one with the app's
 * defaults. Like the app, it has settings before the first render, the
 * defaults unless the test seeded others.
 */
export function queryWrapper(queryClient: QueryClient = createQueryClient()) {
  if (!queryClient.getQueryData(settingsQuery.queryKey)) {
    seedSettings(queryClient);
  }
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

type QueryOptions = { queryClient?: QueryClient };

/** Testing Library's render, inside `queryClient` or a fresh one. */
export function render(
  ui: ReactElement,
  {
    queryClient,
    ...options
  }: Omit<rtl.RenderOptions, "wrapper"> & QueryOptions = {},
) {
  return rtl.render(ui, { ...options, wrapper: queryWrapper(queryClient) });
}

/** Testing Library's renderHook, inside `queryClient` or a fresh one. */
export function renderHook<Result, Props>(
  callback: (props: Props) => Result,
  {
    queryClient,
    ...options
  }: Omit<rtl.RenderHookOptions<Props>, "wrapper"> & QueryOptions = {},
) {
  return rtl.renderHook(callback, {
    ...options,
    wrapper: queryWrapper(queryClient),
  });
}
