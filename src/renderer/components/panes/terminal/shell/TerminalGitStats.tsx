/**
 * TerminalGitStats - Git diff stats badge for terminal panes.
 *
 * Displays aggregated git diff statistics (+X -Y) pinned to the top-right
 * corner of the terminal. Only shows when the terminal's cwd is a git repo
 * with uncommitted changes.
 *
 * Clicking opens the editor sidebar for the terminal's cwd.
 *
 * Reuses DiffStatsDisplay from the editor for consistent presentation.
 * Uses useUncommittedDiffStats hook for real-time stat updates.
 */

import { DiffStatsDisplay } from "@/components/panes/editor-v2/components/FileDiffStats";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useCommand,
  getCommandDisplayTitle,
} from "@/commands/hooks/useCommand";
import { useUncommittedDiffStats } from "@/hooks/useUncommittedDiffStats";
import { isSidebarOpenAtom } from "@/store/atoms";
import { ApplicationCommands } from "@shared/commands";
import { useSetAtom } from "jotai";
import { memo, useCallback } from "react";

/**
 * Internal component that uses the hooks.
 * Separated to allow conditional rendering in the parent.
 */
const TerminalGitStatsInner = memo(function TerminalGitStatsInner({
  cwd,
  sandboxId,
}: {
  cwd: string;
  sandboxId?: string;
}) {
  const { stats, isGitRepo } = useUncommittedDiffStats(cwd, sandboxId);
  const setIsSidebarOpen = useSetAtom(isSidebarOpenAtom);
  const toggleSidebarCmd = useCommand(ApplicationCommands.VIEW_TOGGLE_SIDEBAR);

  const handleClick = useCallback(() => {
    setIsSidebarOpen(true);
  }, [setIsSidebarOpen]);

  // Don't render if not a git repo or no stats
  if (isGitRepo === false || !stats) {
    return null;
  }

  // Don't render if no changes
  if (stats.added === 0 && stats.removed === 0) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          className="absolute top-3 right-3 z-15 flex items-center rounded-full px-2 py-1 bg-transparent border border-transparent hover:bg-elevated/90 hover:backdrop-blur-sm hover:border-elevated-border/50 transition-all duration-200 cursor-pointer"
        >
          <DiffStatsDisplay stats={stats} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {getCommandDisplayTitle(toggleSidebarCmd)}
      </TooltipContent>
    </Tooltip>
  );
});

/**
 * Displays aggregated git diff statistics for a terminal's cwd.
 *
 * Features:
 * - Only renders when cwd is a git repo with changes
 * - Subscribes to git status changes for real-time updates
 * - Uses shared backend cache (no duplicate git operations)
 * - Pinned to top-right corner (doesn't scroll with terminal)
 * - Reuses DiffStatsDisplay for consistent styling with editor
 */
export const TerminalGitStats = memo(function TerminalGitStats({
  cwd,
  sandboxId,
}: {
  cwd: string | null;
  sandboxId?: string;
}) {
  // Don't render anything if no cwd
  if (!cwd) {
    return null;
  }

  return <TerminalGitStatsInner cwd={cwd} sandboxId={sandboxId} />;
});
