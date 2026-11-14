import { openWorkspace } from "@features/workspaces/client/actions";
import {
  workspaceMutations,
  workspacesQuery,
} from "@features/workspaces/client/queries";
import {
  activeTabIdAtom,
  previousTabsSnapshotAtom,
  tabsAtom,
  workspaceHasChangesAtom,
  workspaceNameAtom,
} from "@/store/atoms";
import { useSettings } from "@features/settings/client/queries";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSelector } from "@tanstack/react-store";
import { useCallback, useEffect, useRef, useState } from "react";

export function useWorkspaces() {
  const workspaceName = useSelector(workspaceNameAtom);
  const { data: hasLastWorkspace = false } = useQuery({
    ...workspacesQuery,
    select: (state) => Boolean(state.lastWorkspace),
  });
  // Autosave has its own observer, so it can't replace the save dialog's
  // onSuccess, which only the latest mutate call on an observer gets.
  const { mutate: autosave } = useMutation(workspaceMutations.save());
  const { mutate: save } = useMutation(workspaceMutations.save());
  const { mutate: rename } = useMutation(workspaceMutations.rename());

  const autoSaveWorkspaces = useSettings((s) => s.autoSaveWorkspaces);

  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [showCreateWorkspaceDialog, setShowCreateWorkspaceDialog] =
    useState(false);
  const [showRenameWorkspaceDialog, setShowRenameWorkspaceDialog] =
    useState(false);

  // Track workspace changes - compare tabs deeply to detect changes
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const unsubscribeOpenWorkspace = window.conduit.onOpenWorkspaceRequest(
      (workspace) => openWorkspace(workspace),
    );

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      unsubscribeOpenWorkspace();
    };
  }, []);

  // Reset change tracking when workspace changes. It comes before the
  // tracking below, so a newly opened workspace's tabs become its baseline.
  useEffect(() => {
    previousTabsSnapshotAtom.set("");

    // Clear auto-save timer when workspace changes
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, [workspaceName]);

  // Subscribed rather than selected, so tab updates don't re-render the app
  useEffect(() => {
    if (!workspaceName) {
      workspaceHasChangesAtom.set(false);
      return;
    }

    const trackChanges = () => {
      // Deep serialize tabs to detect any changes
      const currentTabsSnapshot = JSON.stringify(tabsAtom.get());
      const previousTabsSnapshot = previousTabsSnapshotAtom.get();

      if (previousTabsSnapshot === "") {
        // First time tracking this workspace
        previousTabsSnapshotAtom.set(currentTabsSnapshot);
        workspaceHasChangesAtom.set(false);
      } else if (previousTabsSnapshot !== currentTabsSnapshot) {
        // Tabs have changed
        workspaceHasChangesAtom.set(true);

        // If auto-save is enabled, schedule a save
        if (autoSaveWorkspaces) {
          // Clear any existing timer
          if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
          }

          // Schedule auto-save after 2 seconds
          autoSaveTimerRef.current = setTimeout(() => {
            if (activeTabIdAtom.get()) autosave();
          }, 2000);
        }
      }
    };

    trackChanges();
    const tabsSubscription = tabsAtom.subscribe(trackChanges);
    // A save moves the baseline and clears the flag, so check again for
    // changes made while it ran. The baseline alone may not notify, since a
    // save can match the one before it.
    const savedSubscription = workspaceHasChangesAtom.subscribe(() => {
      if (!workspaceHasChangesAtom.get()) trackChanges();
    });
    return () => {
      tabsSubscription.unsubscribe();
      savedSubscription.unsubscribe();
    };
  }, [workspaceName, autoSaveWorkspaces, autosave]);

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

      save(name, {
        onSuccess: () => {
          setShowCreateWorkspaceDialog(false);
          onSaved?.();
        },
      });
    },
    [save],
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
    hasLastWorkspace,

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
