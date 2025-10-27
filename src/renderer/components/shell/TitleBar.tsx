import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { openWorkspace } from "@/store/actions/workspace";
import {
  workspaceHasChangesAtom,
  workspaceNameAtom,
  workspacesAtom,
} from "@/store/atoms";
import type { Workspace } from "@shared/types";
import { useAtom, useAtomValue } from "jotai";
import { Cable, Check, LayoutDashboard, Trash2 } from "lucide-react";
import { useCallback } from "react";

type TitleBarProps = {
  backgroundClass: string;
  onSaveWorkspace: () => void;
  onRenameWorkspace: () => void;
  onCloseWorkspace: () => void;
};

export const TitleBar = ({
  backgroundClass,
  onSaveWorkspace,
  onRenameWorkspace,
  onCloseWorkspace,
}: TitleBarProps) => {
  const api = window.conduit;
  if (api?.platform !== "darwin") {
    return null;
  }

  const workspaceName = useAtomValue(workspaceNameAtom);
  const [workspaces, setWorkspaces] = useAtom(workspacesAtom);
  const hasChanges = useAtomValue(workspaceHasChangesAtom);

  const titleBarSuffix = workspaceName ? ` (${workspaceName})` : "";

  const handleOpenWorkspace = useCallback(
    (workspace: Workspace) => {
      // No-op if clicking on the current workspace
      if (workspace.name === workspaceName) {
        return;
      }
      void openWorkspace(workspace);
    },
    [workspaceName]
  );

  const handleDeleteWorkspace = useCallback(
    async (workspace: Workspace, event: React.MouseEvent) => {
      event.stopPropagation();
      
      if (!api) {
        return;
      }

      await api.deleteSession(workspace.timestamp);
      const updatedWorkspaces = (await api.loadSessions()) as Workspace[];
      setWorkspaces(updatedWorkspaces);
    },
    [api, setWorkspaces]
  );

  return (
    <div
      className={`h-[28px] flex items-center justify-between px-3 text-[0.8rem] text-white/40 font-medium ${backgroundClass} rounded-xl`}
    >
      {/* Left side - draggable area */}
      <div className="flex-1 [app-region:drag]"></div>

      {/* Center - title */}
      <div className="[app-region:drag] flex gap-2 items-center"><Cable size={14} /> Conduit{titleBarSuffix}</div>

      {/* Right side - workspace menu */}
      <div className="flex-1 flex justify-end [app-region:no-drag]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="relative p-1 rounded text-white mt-1 hover:bg-white/10 transition-colors"
              aria-label="Workspace menu"
            >
              <LayoutDashboard className="w-4 h-4" />
              {hasChanges && (
                <span className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* List of workspaces */}
            {workspaces.length > 0 && (
              <>
                {workspaces.map((workspace) => {
                  const isCurrentWorkspace = workspaceName === workspace.name;
                  return (
                    <DropdownMenuItem
                      key={workspace.timestamp}
                      onClick={() => handleOpenWorkspace(workspace)}
                      className={
                        isCurrentWorkspace
                          ? "flex items-center justify-between bg-gradient-to-br from-accent-start to-accent-end text-white"
                          : "flex items-center justify-between"
                      }
                    >
                      <span>{workspace.name}</span>
                      {isCurrentWorkspace ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <button
                          onClick={(e) => handleDeleteWorkspace(workspace, e)}
                          className="p-1 rounded hover:bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-white/30"
                          aria-label="Delete workspace"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
              </>
            )}

            {/* Save workspace */}
            <DropdownMenuItem onClick={onSaveWorkspace}>
              Save workspace
            </DropdownMenuItem>

            {/* Rename workspace - only enabled when in a workspace */}
            <DropdownMenuItem
              onClick={onRenameWorkspace}
              disabled={!workspaceName}
            >
              Rename workspace
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Close workspace - only enabled when in a workspace */}
            <DropdownMenuItem
              onClick={onCloseWorkspace}
              disabled={!workspaceName}
            >
              Close workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};
