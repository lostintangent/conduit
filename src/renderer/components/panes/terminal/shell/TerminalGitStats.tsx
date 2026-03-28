/**
 * TerminalGitStats - Git stats badge for terminal panes.
 *
 * Displays aggregated git diff statistics (+X -Y) and file status summary
 * pinned to the top-right corner of the terminal. Only shows when the
 * terminal's cwd is a git repo with uncommitted changes.
 *
 * Clicking opens the editor sidebar for the terminal's cwd.
 *
 * Reuses DiffStatsDisplay and GitStatusSummary from the editor for
 * consistent presentation. Uses useUncommittedDiffStats hook for real-time
 * stat updates with zero additional overhead (uses event data directly).
 */

import { DiffStatsDisplay } from "@/components/panes/editor/components/FileDiffStats";
import { GitStatusSummary } from "@/components/panes/editor/components/FileTreePanel/GitStatusSummary";
import { Separator } from "@/components/ui/separator";
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
import { sidebarStateAtom } from "@/store/sidebarStore";
import { ApplicationCommands } from "@shared/commands";
import { useSetAtom } from "jotai";
import { memo, useCallback, useState } from "react";

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
  const { stats, gitStatus, isGitRepo } = useUncommittedDiffStats(
    cwd,
    sandboxId,
  );
  const setSidebarState = useSetAtom(sidebarStateAtom);
  const toggleSidebarCmd = useCommand(ApplicationCommands.VIEW_TOGGLE_SIDEBAR);
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = useCallback(() => {
    setSidebarState({
      isOpen: true,
      view: "editor",
      navigation: { cwd, editorTreeMode: "changes" },
    });
  }, [setSidebarState, cwd]);

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  // Don't render if not a git repo or no stats
  if (isGitRepo === false || !stats) {
    return null;
  }

  // Don't render if no changes (check both diff stats and git status)
  const hasChanges =
    stats.added > 0 || stats.removed > 0 || (gitStatus?.size ?? 0) > 0;
  if (!hasChanges) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full px-2 py-1 bg-transparent border border-transparent hover:bg-elevated/90 hover:backdrop-blur-sm hover:border-elevated-border/50 transition-all duration-200 cursor-pointer"
        >
          <DiffStatsDisplay stats={stats} />
          {gitStatus && gitStatus.size > 0 && (
            <>
              <Separator orientation="vertical" className="h-3 opacity-30" />
              <span className="text-[10px] font-mono">
                <GitStatusSummary
                  gitStatus={gitStatus}
                  changedFilesCount={gitStatus.size}
                  isHovered={isHovered}
                />
              </span>
            </>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {getCommandDisplayTitle(toggleSidebarCmd)}
      </TooltipContent>
    </Tooltip>
  );
});

/**
 * Displays aggregated git statistics for a terminal's cwd.
 *
 * Features:
 * - Shows diff stats (+X -Y) and file status summary (M, A, D badges)
 * - Only renders when cwd is a git repo with changes
 * - Subscribes to git status changes for real-time updates
 * - Uses event data directly for gitStatus (zero additional IPC overhead)
 * - Pinned to top-right corner (doesn't scroll with terminal)
 * - Reuses DiffStatsDisplay and GitStatusSummary for consistent styling
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
