import { clearPressedKeys } from "@/commands/keybindings/parser";
import { openWorkspace } from "@features/workspaces/client/actions";
import { workspaceStateAtom } from "@/store/atoms";
import { cn } from "@/utils";
import { formatRelativeTime } from "@/utils/time";
import type { Workspace } from "@shared/types";
import { useAtom } from "@tanstack/react-store";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type WorkspacePickerDialog = {
  isOpen: boolean;
  onClose: () => void;
};

const { workspace } = window.conduit;

export function WorkspacePicker({ isOpen, onClose }: WorkspacePickerDialog) {
  const [{ workspaces }, setWorkspaceState] = useAtom(workspaceStateAtom);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    setSelectedIndex(0);
  }, [isOpen]);

  const deleteWorkspace = useCallback(
    async (name: string) => {
      await workspace.deleteWorkspace(name);
      const state = await workspace.getState();
      setWorkspaceState(state);

      if (state.workspaces.length === 0) {
        onClose();
      } else {
        setSelectedIndex((current) =>
          Math.min(current, state.workspaces.length - 1),
        );
      }
    },
    [onClose, setWorkspaceState],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (key === "enter") {
        event.preventDefault();
        const session = workspaces[selectedIndex];
        if (session) {
          void (async () => {
            await openWorkspace(session);
            clearPressedKeys();
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
          void deleteWorkspace(selectedWorkspace.name);
        }
      }
    },
    [onClose, selectedIndex, workspaces, deleteWorkspace],
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
    (session: Workspace, event: React.MouseEvent) => {
      event.stopPropagation();
      void deleteWorkspace(session.name);
    },
    [deleteWorkspace],
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="w-[480px] max-w-[90vw]"
        onKeyDown={handleKeyDown}
        showClose={false}
        aria-describedby={undefined}
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
                        {`${formatRelativeTime(workspace.lastModified / 1000)} ago`}
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
