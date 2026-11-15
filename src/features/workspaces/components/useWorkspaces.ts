import {
  openWorkspace,
  saveWorkspaceAs,
} from "@features/workspaces/client/actions";
import {
  workspaceMutations,
  workspacesQuery,
} from "@features/workspaces/client/queries";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

/** The name of the open workspace, or null while it's the anonymous one. */
export function useCurrentWorkspace(): string | null {
  const { data = null } = useQuery({
    ...workspacesQuery,
    select: (state) => state.current ?? null,
  });
  return data;
}

export function useWorkspaces() {
  const workspaceName = useCurrentWorkspace();
  const { mutate: rename } = useMutation(workspaceMutations.rename());

  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [showCreateWorkspaceDialog, setShowCreateWorkspaceDialog] =
    useState(false);
  const [showRenameWorkspaceDialog, setShowRenameWorkspaceDialog] =
    useState(false);

  useEffect(
    () =>
      window.conduit.workspaces.on("openRequested", (name) => {
        void openWorkspace(name);
      }),
    [],
  );

  /** Saves the window's tabs as a new workspace and opens it. */
  const saveWorkspace = useCallback(
    (customName: string, onSaved?: () => void) => {
      let name = customName.trim();
      if (name.length === 0) {
        const now = new Date();
        name = `Layout ${now.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })}`;
      }

      // A failed save has already said so, and leaves the dialog open
      void saveWorkspaceAs(name).then(
        (saved) => {
          if (!saved) return;
          setShowCreateWorkspaceDialog(false);
          onSaved?.();
        },
        () => {},
      );
    },
    [],
  );

  const renameWorkspace = useCallback(
    (newName: string) => {
      const trimmedName = newName.trim();
      if (
        !workspaceName ||
        trimmedName.length === 0 ||
        trimmedName === workspaceName
      ) {
        setShowRenameWorkspaceDialog(false);
        return;
      }

      rename(
        { from: workspaceName, to: trimmedName },
        { onSuccess: () => setShowRenameWorkspaceDialog(false) },
      );
    },
    [workspaceName, rename],
  );

  return {
    workspaceName,

    showWorkspacePicker,
    setShowWorkspacePicker,
    showCreateWorkspaceDialog,
    setShowCreateWorkspaceDialog,
    showRenameWorkspaceDialog,
    setShowRenameWorkspaceDialog,

    saveWorkspace,
    renameWorkspace,
  };
}
