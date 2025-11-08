import { useAtom, useAtomValue } from "jotai";
import { Check, LayoutDashboard, Trash2 } from "lucide-react";
import { type MouseEvent, useCallback } from "react";

import { ApplicationCommands } from "@/commands/applicationCommands";
import {
  getCommandDisplayTitle,
  useCommand,
} from "@/commands/hooks/useCommand";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { openWorkspace } from "@/store/actions/workspace";
import {
  userSettingsAtom,
  workspaceHasChangesAtom,
  workspaceNameAtom,
  workspacesAtom,
} from "@/store/atoms";
import { cn } from "@/utils";
import type { Workspace } from "@shared/types";

const api = window.conduit;

export const WorkspaceMenu = () => {
  const { autoSaveWorkspaces } = useAtomValue(userSettingsAtom);

  const [workspaces, setWorkspaces] = useAtom(workspacesAtom);
  const workspaceName = useAtomValue(workspaceNameAtom);
  const hasWorkspaceChanges = useAtomValue(workspaceHasChangesAtom);

  const saveWorkspaceCmd = useCommand(ApplicationCommands.WORKSPACE_SAVE);
  const renameWorkspaceCmd = useCommand(ApplicationCommands.WORKSPACE_RENAME);
  const duplicateWorkspaceCmd = useCommand(
    ApplicationCommands.WORKSPACE_DUPLICATE
  );
  const closeWorkspaceCmd = useCommand(ApplicationCommands.WORKSPACE_CLOSE);

  const handleOpenWorkspace = useCallback(
    (workspace: Workspace) => {
      if (workspace.name === workspaceName) return;

      openWorkspace(workspace);
    },
    [workspaceName]
  );

  const handleDeleteWorkspace = useCallback(
    async (workspace: Workspace, e?: MouseEvent<HTMLButtonElement>) => {
      e?.preventDefault();
      e?.stopPropagation();

      await api.deleteSession(workspace.timestamp);

      setWorkspaces((current) =>
        current.filter(({ name }) => name !== workspace.name)
      );
    },
    [setWorkspaces]
  );

  return (
    <DropdownMenu>
      {/* Workspaces button w/tooltip */}
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className="relative p-1 rounded text-white hover:bg-white/10 transition-colors"
              aria-label="Workspaces"
            >
              <LayoutDashboard className="w-4 h-4" />
              {hasWorkspaceChanges && !autoSaveWorkspaces && (
                <span className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full" />
              )}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Workspaces</TooltipContent>
      </Tooltip>

      {/* Workspaces list */}
      <DropdownMenuContent align="end">
        {workspaces.length > 0 && (
          <>
            {workspaces.map((workspace) => {
              const isCurrentWorkspace = workspaceName === workspace.name;

              return (
                <DropdownMenuItem
                  onClick={() => handleOpenWorkspace(workspace)}
                  className={cn(
                    "flex items-center justify-between",
                    isCurrentWorkspace &&
                    "bg-gradient-to-br from-accent-start to-accent-end text-white"
                  )}
                >
                  <span>{workspace.name}</span>
                  {isCurrentWorkspace ? (
                    <Check className="w-4 h-4 mr-1" />
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={(e) => handleDeleteWorkspace(workspace, e)}
                          className="p-1 rounded hover:bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-white/30 group"
                          aria-label="Delete workspace"
                        >
                          <Trash2 className="w-4 h-4 group-hover:text-red-500" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Delete workspace</TooltipContent>
                    </Tooltip>
                  )}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
          </>
        )}

        {/* Workspace management actions */}

        <DropdownMenuItem
          onClick={saveWorkspaceCmd.execute}
          title={getCommandDisplayTitle(saveWorkspaceCmd)}
        >
          {saveWorkspaceCmd.title}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={renameWorkspaceCmd.execute}
          disabled={!workspaceName}
          title={getCommandDisplayTitle(renameWorkspaceCmd)}
        >
          {renameWorkspaceCmd.title}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={duplicateWorkspaceCmd.execute}
          disabled={!workspaceName}
          title={getCommandDisplayTitle(duplicateWorkspaceCmd)}
        >
          {duplicateWorkspaceCmd.title}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={closeWorkspaceCmd.execute}
          disabled={!workspaceName}
          title={getCommandDisplayTitle(closeWorkspaceCmd)}
        >
          {closeWorkspaceCmd.title}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
