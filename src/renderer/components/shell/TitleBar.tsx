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
import { useAtomValue } from "jotai";
import { Check, LayoutDashboard } from "lucide-react";
import { useCallback } from "react";

type TitleBarProps = {
  backgroundClass: string;
  onSaveWorkspace: () => void;
  onCloseWorkspace: () => void;
};

export const TitleBar = ({
  backgroundClass,
  onSaveWorkspace,
  onCloseWorkspace,
}: TitleBarProps) => {
  const api = window.conduit;
  if (api?.platform !== "darwin") {
    return null;
  }

  const workspaceName = useAtomValue(workspaceNameAtom);
  const workspaces = useAtomValue(workspacesAtom);
  const hasChanges = useAtomValue(workspaceHasChangesAtom);

  const titleBarSuffix = workspaceName ? ` (${workspaceName})` : "";

  const handleOpenWorkspace = useCallback(
    (workspace: Workspace) => {
      void openWorkspace(workspace);
    },
    []
  );

  return (
    <div
      className={`h-[28px] flex items-center justify-between px-3 text-[0.8rem] text-white/40 font-medium ${backgroundClass} rounded-xl`}
    >
      {/* Left side - draggable area */}
      <div className="flex-1 [app-region:drag]"></div>

      {/* Center - title */}
      <div className="[app-region:drag]">🔌 Conduit{titleBarSuffix}</div>

      {/* Right side - workspace menu */}
      <div className="flex-1 flex justify-end [app-region:no-drag]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="relative p-1 rounded hover:bg-white/10 transition-colors"
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
                {workspaces.map((workspace) => (
                  <DropdownMenuItem
                    key={workspace.timestamp}
                    onClick={() => handleOpenWorkspace(workspace)}
                    className="flex items-center justify-between"
                  >
                    <span>{workspace.name}</span>
                    {workspaceName === workspace.name && (
                      <Check className="w-4 h-4" />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </>
            )}

            {/* Save workspace */}
            <DropdownMenuItem onClick={onSaveWorkspace}>
              Save workspace
            </DropdownMenuItem>

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
