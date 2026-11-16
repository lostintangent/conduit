import {
  type MutationFunctionContext,
  mutationOptions,
  queryOptions,
} from "@tanstack/react-query";
import { sidebarPage } from "@features/browser/client/sidebar";
import {
  activeTabIdAtom,
  stripTabsAtom,
} from "@features/workbench/client/atoms";
import type { WorkspaceState } from "../model";

export const workspaceKeys = { all: ["workspaces"] as const };

/**
 * The saved workspaces, the anonymous one, and which is open. Only this
 * window changes them, through the mutations below.
 */
export const workspacesQuery = queryOptions({
  queryKey: workspaceKeys.all,
  queryFn: () => window.conduit.workspaces.getState(),
  staleTime: Infinity,
});

/**
 * Main makes each change in the order it was asked for, and replies with
 * the new state. It changes its copy before writing the file, so a failed
 * write re-reads it.
 */
function write(name: string, errorMessage: string) {
  return {
    mutationKey: [...workspaceKeys.all, name],
    meta: { errorMessage },
    onSuccess: (
      state: WorkspaceState,
      _variables: unknown,
      _onMutateResult: unknown,
      { client }: MutationFunctionContext,
    ) => client.setQueryData(workspaceKeys.all, state),
    onError: (
      _error: Error,
      _variables: unknown,
      _onMutateResult: unknown,
      { client }: MutationFunctionContext,
    ) => client.invalidateQueries({ queryKey: workspaceKeys.all }),
  };
}

const activeTabId = () => activeTabIdAtom.get() ?? undefined;

export const workspaceMutations = {
  /**
   * Saves the window's tabs and sidebar page into the open workspace. It
   * reads them when the save runs, and main picks the workspace, so a save
   * can't land in the one just switched away from.
   */
  save: () =>
    mutationOptions({
      ...write("save", "Couldn't save the workspace"),
      mutationFn: () =>
        window.conduit.workspaces.saveWorkspace(
          stripTabsAtom.get(),
          activeTabId(),
          sidebarPage(),
        ),
    }),

  /**
   * Saves the window's tabs and sidebar page under a name, and opens that
   * workspace.
   */
  saveAs: () =>
    mutationOptions({
      ...write("saveAs", "Couldn't save the workspace"),
      mutationFn: (name: string) =>
        window.conduit.workspaces.saveWorkspaceAs(
          name,
          stripTabsAtom.get(),
          activeTabId(),
          sidebarPage(),
        ),
    }),

  /** Marks a workspace open, or the anonymous one for `null`. */
  setCurrent: () =>
    mutationOptions({
      ...write("setCurrent", "Couldn't open the workspace"),
      mutationFn: (name: string | null) =>
        window.conduit.workspaces.setCurrentWorkspace(name),
    }),

  rename: () =>
    mutationOptions({
      ...write("rename", "Couldn't rename the workspace"),
      mutationFn: ({ from, to }: { from: string; to: string }) =>
        window.conduit.workspaces.renameWorkspace(from, to),
    }),

  delete: () =>
    mutationOptions({
      ...write("delete", "Couldn't delete the workspace"),
      mutationFn: (name: string) =>
        window.conduit.workspaces.deleteWorkspace(name),
    }),

  /**
   * Starts over without the last session, which couldn't reopen, and
   * resolves to the workspace that keeps its tabs.
   */
  recoverLastSession: () =>
    mutationOptions({
      mutationKey: [...workspaceKeys.all, "recoverLastSession"],
      meta: { errorMessage: "Couldn't keep your last session" },
      mutationFn: () => window.conduit.workspaces.recoverLastSession(),
      onSettled: (_name, _error, _variables, _onMutateResult, { client }) =>
        client.invalidateQueries({ queryKey: workspaceKeys.all }),
    }),

  /** Asks for a workspace file and adds it, under a new name if it's taken. */
  import: () =>
    mutationOptions({
      mutationKey: [...workspaceKeys.all, "import"],
      meta: { errorMessage: "Couldn't import the workspace" },
      mutationFn: () => window.conduit.workspaces.importFromFile(),
      onSettled: (
        _workspace,
        _error,
        _variables,
        _onMutateResult,
        { client },
      ) => client.invalidateQueries({ queryKey: workspaceKeys.all }),
    }),
};
