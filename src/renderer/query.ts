import { QueryCache, QueryClient } from "@tanstack/react-query";

/**
 * Create a QueryClient for data from the main process. IPC is local, so
 * queries shouldn't pause while the machine is offline or retry
 * deterministic failures, and watchers (not window focus) decide when data
 * is stale.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) =>
        console.error("[query] Failed to load", query.queryKey, error),
    }),
    defaultOptions: {
      queries: {
        networkMode: "always",
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
}

/** The renderer's QueryClient. */
export const queryClient = createQueryClient();
