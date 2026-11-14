import { useMutation, useQuery } from "@tanstack/react-query";
import { useSelector } from "@tanstack/react-store";
import { Download, LayoutDashboard, Trash2 } from "lucide-react";
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
import { useSettings } from "@features/settings/client/queries";
import { openWorkspace } from "@features/workspaces/client/actions";
import {
  workspaceMutations,
  workspacesQuery,
} from "@features/workspaces/client/queries";
import { workspaceHasChangesAtom, workspaceNameAtom } from "@/store/atoms";
import { cn } from "@/utils";
import type { Workspace } from "@shared/types";

const api = window.conduit;

export const WorkspaceMenu = () => {
  const autoSaveWorkspaces = useSettings((s) => s.autoSaveWorkspaces);

  const { data: workspaces = [] } = useQuery({
    ...workspacesQuery,
    select: (state) => state.workspaces,
  });
  const { mutate: importWorkspace } = useMutation(workspaceMutations.import());
  const { mutate: deleteWorkspace } = useMutation(workspaceMutations.delete());
  const workspaceName = useSelector(workspaceNameAtom);
  const hasWorkspaceChanges = useSelector(workspaceHasChangesAtom);

  const saveWorkspaceCmd = useCommand(ApplicationCommands.WORKSPACE_SAVE);
  const renameWorkspaceCmd = useCommand(ApplicationCommands.WORKSPACE_RENAME);
  const duplicateWorkspaceCmd = useCommand(
    ApplicationCommands.WORKSPACE_DUPLICATE,
  );
  const closeWorkspaceCmd = useCommand(ApplicationCommands.WORKSPACE_CLOSE);

  const handleImportWorkspace = useCallback(() => {
    importWorkspace(undefined, {
      onSuccess: (workspace) => {
        if (workspace) void openWorkspace(workspace);
      },
    });
  }, [importWorkspace]);

  const handleOpenWorkspace = useCallback(
    (workspace: Workspace) => {
      if (workspace.name === workspaceName) return;
      openWorkspace(workspace);
    },
    [workspaceName],
  );

  const handleExportWorkspace = useCallback(
    async (workspace: Workspace, e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      await api.workspaces.exportToFile(workspace);
    },
    [],
  );

  const handleDeleteWorkspace = useCallback(
    (workspace: Workspace, e: MouseEvent<HTMLButtonElement>) => {
      // Prevent the click from bubbling up to the menu item
      // which would result in the workspace being opened
      e.stopPropagation();
      deleteWorkspace(workspace.name);
    },
    [deleteWorkspace],
  );

  return (
    <DropdownMenu>
      {/* Workspaces button w/tooltip */}
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className="relative p-1 rounded hover:bg-foreground/10 transition-colors"
              aria-label="Workspaces"
            >
              <LayoutDashboard className="w-4 h-4" />
              {hasWorkspaceChanges && !autoSaveWorkspaces && (
                <span className="absolute top-0 right-0 w-2 h-2 bg-accent rounded-full" />
              )}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Workspaces</TooltipContent>
      </Tooltip>

      {/* Workspaces list. Opening or closing a workspace replaces the active pane, so focus goes there. */}
      <DropdownMenuContent align="end" focusPaneOnSelect>
        {workspaces.length > 0 && (
          <>
            {workspaces.map((workspace) => {
              const isCurrentWorkspace = workspaceName === workspace.name;

              return (
                <DropdownMenuItem
                  key={workspace.name}
                  onClick={() => handleOpenWorkspace(workspace)}
                  className={cn(
                    "flex items-center justify-between",
                    isCurrentWorkspace && "magic",
                  )}
                >
                  <span>{workspace.name}</span>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={(e) => handleExportWorkspace(workspace, e)}
                          className="p-1 rounded hover:bg-foreground/20 transition-colors focus:outline-none focus:ring-2 focus:ring-foreground/30 group"
                          aria-label="Export workspace"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Export workspace</TooltipContent>
                    </Tooltip>

                    {!isCurrentWorkspace && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => handleDeleteWorkspace(workspace, e)}
                            className="p-1 rounded hover:bg-foreground/20 transition-colors focus:outline-none focus:ring-2 focus:ring-foreground/30 group"
                            aria-label="Delete workspace"
                          >
                            <Trash2 className="w-4 h-4 group-hover:text-red-500" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Delete workspace</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
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

        <DropdownMenuItem onClick={handleImportWorkspace}>
          Import Workspace...
        </DropdownMenuItem>

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
