import { useAtom, useAtomValue } from "jotai";
import { Check, Download, LayoutDashboard, Trash2 } from "lucide-react";
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
    ApplicationCommands.WORKSPACE_DUPLICATE,
  );
  const closeWorkspaceCmd = useCommand(ApplicationCommands.WORKSPACE_CLOSE);

  const handleOpenWorkspace = useCallback(
    (workspace: Workspace) => {
      if (workspace.name === workspaceName) return;

      openWorkspace(workspace);
    },
    [workspaceName],
  );

  const handleDeleteWorkspace = useCallback(
    async (workspace: Workspace, e?: MouseEvent<HTMLButtonElement>) => {
      e?.preventDefault();
      e?.stopPropagation();

      try {
        await api.deleteWorkspace(workspace.timestamp);

        setWorkspaces((current) =>
          current.filter(({ name }) => name !== workspace.name),
        );
      } catch (error) {
        console.error("Failed to delete workspace:", error);
      }
    },
    [setWorkspaces],
  );

  const handleExportWorkspace = useCallback(
    async (workspace: Workspace, e?: MouseEvent<HTMLButtonElement>) => {
      e?.preventDefault();
      e?.stopPropagation();

      try {
        await api.exportWorkspace(workspace);
      } catch (error) {
        console.error("Failed to export workspace:", error);
      }
    },
    [],
  );

  const handleImportWorkspace = useCallback(async () => {
    try {
      const importedWorkspaces = (await api.importWorkspace()) as
        | Workspace[]
        | null;
      if (importedWorkspaces) {
        setWorkspaces(importedWorkspaces);
      }
    } catch (error) {
      console.error("Failed to import workspace:", error);
    }
  }, [setWorkspaces]);

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
                    isCurrentWorkspace && "magic",
                  )}
                >
                  <span>{workspace.name}</span>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={(e) => handleExportWorkspace(workspace, e)}
                          className="p-1 rounded hover:bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-white/30 group"
                          aria-label="Export workspace"
                        >
                          <Download className="w-4 h-4 group-hover:text-accent" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Export workspace</TooltipContent>
                    </Tooltip>
                    {isCurrentWorkspace ? (
                      <Check className="w-4 h-4" />
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
                  </div>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
          </>
        )}

        {/* Workspace management actions */}

        <DropdownMenuItem onClick={handleImportWorkspace}>
          Import workspace…
        </DropdownMenuItem>

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
