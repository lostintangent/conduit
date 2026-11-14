import { createQueryClient } from "@/query";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as rtl from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

/** A wrapper providing `queryClient`, by default a fresh one with the app's defaults. */
export function queryWrapper(queryClient: QueryClient = createQueryClient()) {
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
