import {
  type MutationFunctionContext,
  mutationOptions,
  queryOptions,
} from "@tanstack/react-query";
import {
  activeTabIdAtom,
  previousTabsSnapshotAtom,
  tabsAtom,
  workspaceHasChangesAtom,
  workspaceNameAtom,
} from "@/store/atoms";
import type { Tab } from "@/types";

export const workspaceKeys = { all: ["workspaces"] as const };

/**
 * The saved workspaces, and the tabs saved when the app last closed. Only
 * this window changes them, through the mutations below.
 */
export const workspacesQuery = queryOptions({
  queryKey: workspaceKeys.all,
  queryFn: () => window.conduit.workspaces.getState(),
  staleTime: Infinity,
});

/**
 * Main writes every workspace change to one file, so writes queue in one
 * scope. Main changes its copy before writing the file, so a failed write
 * re-reads it.
 */
function write(name: string, errorMessage?: string) {
  return {
    mutationKey: [...workspaceKeys.all, name],
    scope: { id: "workspaces" },
    meta: { errorMessage },
    onError: (
      _error: Error,
      _variables: unknown,
      _onMutateResult: unknown,
      { client }: MutationFunctionContext,
    ) => client.invalidateQueries({ queryKey: workspaceKeys.all }),
  };
}

export const workspaceMutations = {
  /**
   * Saves the window's tabs as `name`, or as the open workspace, and makes
   * that the open workspace. It reads the tabs and the open workspace's name
   * when the save runs, so an autosave queued behind a rename saves under
   * the new name.
   */
  save: () =>
    mutationOptions({
      ...write("save", "Couldn't save the workspace"),
      mutationFn: async (name?: string) => {
        const saveAs = name ?? workspaceNameAtom.get();
        if (!saveAs) return null;
        const tabs = tabsAtom.get();
        const state = await window.conduit.workspaces.saveWorkspace(
          saveAs,
          tabs,
          activeTabIdAtom.get() ?? undefined,
        );
        return { name: saveAs, tabs, state };
      },
      onSuccess: (saved, _name, _onMutateResult, { client }) => {
        if (!saved) return;
        client.setQueryData(workspaceKeys.all, saved.state);
        workspaceNameAtom.set(saved.name);
        previousTabsSnapshotAtom.set(JSON.stringify(saved.tabs));
        workspaceHasChangesAtom.set(false);
      },
    }),

  rename: () =>
    mutationOptions({
      ...write("rename", "Couldn't rename the workspace"),
      mutationFn: ({ from, to }: { from: string; to: string }) =>
        window.conduit.workspaces.renameWorkspace(from, to),
      onSuccess: (state, { from, to }, _onMutateResult, { client }) => {
        client.setQueryData(workspaceKeys.all, state);
        if (workspaceNameAtom.get() === from) workspaceNameAtom.set(to);
      },
    }),

  delete: () =>
    mutationOptions({
      ...write("delete", "Couldn't delete the workspace"),
      mutationFn: (name: string) =>
        window.conduit.workspaces.deleteWorkspace(name),
      onSuccess: (state, _name, _onMutateResult, { client }) => {
        client.setQueryData(workspaceKeys.all, state);
      },
    }),

  /**
   * Asks for a workspace file and adds it. It's outside the scope, since
   * the file picker could otherwise hold every save until it closes.
   */
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

  /**
   * Saves the tabs to reopen next time. The window is closing, so a failure
   * isn't shown.
   */
  saveLast: () =>
    mutationOptions({
      ...write("saveLast"),
      mutationFn: ({
        tabs,
        activeTabId,
      }: {
        tabs: Tab[];
        activeTabId: string | undefined;
      }) => window.conduit.workspaces.saveLastWorkspace(tabs, activeTabId),
    }),
};
