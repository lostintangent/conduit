import { openWorkspace } from "@/store/actions/workspace";
import { cn } from "@/utils";
import type { Workspace } from "@shared/types";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

type WorkspacePickerDialog = {
  isOpen: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  onSessionsUpdate: (sessions: Workspace[]) => void;
};

const { workspace } = window.conduit;

export function WorkspacePicker({
  isOpen,
  onClose,
  workspaces,
  onSessionsUpdate,
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
        const session = workspaces[selectedIndex];
        if (session) {
          void (async () => {
            await openWorkspace(session);
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
        const selectedWorkspace = workspaces[selectedIndex];
        if (selectedWorkspace) {
          void (async () => {
            const api = window.conduit;
            if (!api) {
              return;
            }

            await workspace.deleteWorkspace(selectedWorkspace.name);
            const updatedWorkspaces = await workspace.getState();
            onSessionsUpdate(updatedWorkspaces.workspaces);

            if (updatedWorkspaces.workspaces.length === 0) {
              onClose();
            } else {
              setSelectedIndex((current) =>
                Math.min(current, updatedWorkspaces.workspaces.length - 1),
              );
            }
          })();
        }
      }
    },
    [onClose, selectedIndex, workspaces, onSessionsUpdate],
  );

  const handleOpenWorkspace = useCallback(
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

      await workspace.deleteWorkspace(session.name);
      const updatedWorkspaces = await workspace.getState();
      onSessionsUpdate(updatedWorkspaces.workspaces);

      if (updatedWorkspaces.workspaces.length === 0) {
        onClose();
      } else {
        setSelectedIndex((current) =>
          Math.min(current, updatedWorkspaces.workspaces.length - 1),
        );
      }
    },
    [onClose, onSessionsUpdate],
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
        className="w-[480px] max-w-[90vw]"
        onKeyDown={handleKeyDown}
        showClose={false}
      >
        <DialogHeader>
          <DialogTitle>Open Workspace</DialogTitle>
        </DialogHeader>

        {workspaces.length === 0 ? (
          <p className="rounded-md border border-dashed border-white/10 bg-white/5 px-3 py-2 text-sm">
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
                <li key={workspace.name}>
                  <div
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex w-full items-center rounded-md border transition ${
                      isActive ? "border-transparent magic" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenWorkspace(workspace)}
                      className="flex flex-1 flex-col gap-1 px-3 py-2 text-left focus:outline-none"
                    >
                      <span className="text-sm font-medium">
                        {workspace.name}
                      </span>
                      <span
                        className={cn(
                          "text-xs",
                          !isActive && "text-muted-foreground",
                        )}
                      >
                        {tabCount} tab{tabCount === 1 ? "" : "s"} •{" "}
                        {formatTimestamp(workspace.lastModified)}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleDeleteWorkspace(workspace, e)}
                      aria-label="Delete session"
                      className="mr-2 hover:bg-transparent! hover:text-destructive"
                    >
                      <Trash2 size={12} />
                    </Button>
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
