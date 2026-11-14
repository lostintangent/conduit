import {
  MutationCache,
  type MutationObserverOptions,
  MutationObserver,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";
import { enqueueNotification } from "@/store/actions/notifications";

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: {
      /** Don't log failures, which the component expects and shows. */
      quiet?: boolean;
    };
    mutationMeta: {
      /**
       * Notify when the mutation fails, with this message and the error as
       * its details, or with what the error maps to. Leave it out when the
       * component shows the error itself.
       */
      errorMessage?:
        string | ((error: Error) => { message: string; details?: string });
    };
  }
}

/**
 * Create a QueryClient for data from the main process. IPC is local, so
 * queries and mutations shouldn't pause while the machine is offline, and
 * queries shouldn't retry deterministic failures. Watchers (not window
 * focus) decide when data is stale.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (!query.meta?.quiet) {
          console.error("[query] Failed to load", query.queryKey, error);
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
        console.error("[mutation] Failed", mutation.options.mutationKey, error);
        const errorMessage = mutation.meta?.errorMessage;
        if (errorMessage === undefined) return;
        const { message, details } =
          typeof errorMessage === "string"
            ? { message: errorMessage, details: error.message }
            : errorMessage(error);
        enqueueNotification({ kind: "error", message, details });
      },
    }),
    defaultOptions: {
      queries: {
        networkMode: "always",
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: { networkMode: "always" },
    },
  });
}

/** The renderer's QueryClient. */
export const queryClient = createQueryClient();

/**
 * Run a mutation outside React, as a command handler does, with the same
 * scope and error handling as useMutation. Rejects if it fails.
 */
export function runMutation<TData, TVariables, TOnMutateResult>(
  options: MutationObserverOptions<TData, Error, TVariables, TOnMutateResult>,
  variables: TVariables,
): Promise<TData> {
  return new MutationObserver(queryClient, options).mutate(variables);
}
