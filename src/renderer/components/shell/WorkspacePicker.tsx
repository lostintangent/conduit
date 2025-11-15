import { openWorkspace } from "@/store/actions/workspace";
import type { Workspace } from "@shared/types";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

type WorkspacePickerDialog = {
  isOpen: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  onWorkspacesUpdate: (workspaces: Workspace[]) => void;
};

export function WorkspacePicker({
  isOpen,
  onClose,
  workspaces,
  onWorkspacesUpdate,
}: WorkspacePickerDialog) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    setSelectedIndex(0);
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (key === "enter") {
        event.preventDefault();
        const workspaceEntry = workspaces[selectedIndex];
        if (workspaceEntry) {
          void (async () => {
            await openWorkspace(workspaceEntry);
            onClose();
          })();
        }
        return;
      }

      if (key === "arrowdown") {
        event.preventDefault();
        setSelectedIndex((current) =>
          current >= workspaces.length - 1 ? 0 : current + 1,
        );
        return;
      }

      if (key === "arrowup") {
        event.preventDefault();
        setSelectedIndex((current) =>
          current <= 0 ? workspaces.length - 1 : current - 1,
        );
      }

      if (key === "delete" || key === "backspace") {
        event.preventDefault();
        const workspaceEntry = workspaces[selectedIndex];
        if (workspaceEntry) {
          void (async () => {
            const api = window.conduit;
            if (!api) {
              return;
            }

            await api.deleteWorkspace(workspaceEntry.timestamp);
            const updatedWorkspaces =
              (await api.loadWorkspaces()) as Workspace[];
            onWorkspacesUpdate(updatedWorkspaces);

            if (updatedWorkspaces.length === 0) {
              onClose();
            } else {
              setSelectedIndex((current) =>
                Math.min(current, updatedWorkspaces.length - 1),
              );
            }
          })();
        }
      }
    },
    [onClose, selectedIndex, workspaces, onWorkspacesUpdate],
  );

  const handleRestoreWorkspace = useCallback(
    (session: Workspace) => {
      void (async () => {
        await openWorkspace(session);
        onClose();
      })();
    },
    [onClose],
  );

  const handleDeleteWorkspace = useCallback(
    async (session: Workspace, event: React.MouseEvent) => {
      event.stopPropagation();

      const api = window.conduit;
      if (!api) {
        return;
      }

      await api.deleteWorkspace(session.timestamp);
      const updatedWorkspaces = (await api.loadWorkspaces()) as Workspace[];
      onWorkspacesUpdate(updatedWorkspaces);

      if (updatedWorkspaces.length === 0) {
        onClose();
      } else {
        setSelectedIndex((current) =>
          Math.min(current, updatedWorkspaces.length - 1),
        );
      }
    },
    [onClose, onWorkspacesUpdate],
  );

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return "Just now";
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="w-[480px] max-w-[90vw] border-white/10 bg-popover"
        onKeyDown={handleKeyDown}
        showClose={false}
      >
        <DialogHeader>
          <DialogTitle className="text-white">
            Restore Saved Workspace
          </DialogTitle>
        </DialogHeader>

        {workspaces.length === 0 ? (
          <p className="rounded-md border border-dashed border-white/10 bg-white/5 px-3 py-2 text-sm text-white/50">
            No saved workspaces available.
          </p>
        ) : (
          <ul
            className="max-h-[400px] space-y-2 overflow-y-auto"
            role="listbox"
          >
            {workspaces.map((workspace, index) => {
              const isActive = index === selectedIndex;
              const tabCount = workspace.tabs.length;

              return (
                <li key={workspace.timestamp}>
                  <div
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex w-full items-center rounded-md border transition ${
                      isActive
                        ? "border-white/30 bg-white/10 text-white"
                        : "border-transparent text-white/80 hover:border-white/20 hover:bg-white/5"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleRestoreWorkspace(workspace)}
                      className="flex flex-1 flex-col gap-1 px-3 py-2 text-left focus:outline-none"
                    >
                      <span className="text-sm font-medium">
                        {workspace.name}
                      </span>
                      <span className="text-xs text-white/50">
                        {tabCount} tab{tabCount === 1 ? "" : "s"} •{" "}
                        {formatTimestamp(workspace.timestamp)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteWorkspace(workspace, e)}
                      aria-label="Delete workspace"
                      className="mr-2 rounded-md p-1 text-sm leading-none text-current transition hover:bg-black/20 focus:outline-none focus:ring-2 focus:ring-white/30"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
