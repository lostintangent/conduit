import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowRight,
  GitCompare,
  ArrowDownToLine,
  ArrowUpFromLine,
  Send,
} from "lucide-react";
import { GitStatusSummary } from "./GitStatusSummary";
import type { GitStatusMap } from "@shared/types";

type GitBranchToolbarProps = {
  currentBranch: string | null;
  baseBranch: string | null;
  showOnlyChangedFiles: boolean;
  changedFilesCount?: number;
  gitStatus?: GitStatusMap | null;
  onFilterToggle: () => void;
  onOpenBranchPicker: () => void;
  onPull?: () => void;
  onPush?: () => void;
  isPulling?: boolean;
  isPushing?: boolean;
  hasUpstream?: boolean;
};

export function GitBranchToolbar({
  currentBranch,
  baseBranch,
  showOnlyChangedFiles,
  changedFilesCount = 0,
  gitStatus,
  onFilterToggle,
  onOpenBranchPicker,
  onPull,
  onPush,
  isPulling = false,
  isPushing = false,
  hasUpstream = true,
}: GitBranchToolbarProps) {
  if (!currentBranch) {
    return null;
  }

  const branchLabel =
    baseBranch && baseBranch !== "HEAD" ? (
      <div className="flex items-center gap-1.5 overflow-hidden">
        <span title={baseBranch}>{baseBranch}</span>
        <ArrowRight className="w-3 h-3 flex-shrink-0" />
        <span className="truncate" title={currentBranch}>
          {currentBranch}
        </span>
      </div>
    ) : (
      <span className="truncate" title={currentBranch}>
        {currentBranch}
      </span>
    );

  const toggleButtonClass = "[&_svg]:size-3.5";

  return (
    <div className="px-3 py-1.5 text-xs flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            pressed={baseBranch !== null && baseBranch !== "HEAD"}
            onPressedChange={() => onOpenBranchPicker()}
            size="sm"
            className={toggleButtonClass}
          >
            <GitCompare />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>
          {baseBranch && baseBranch !== "HEAD"
            ? `Comparing ${baseBranch} → ${currentBranch}`
            : "Comparing against HEAD"}
        </TooltipContent>
      </Tooltip>
      <div className="flex flex-1 truncate">{branchLabel}</div>

      {changedFilesCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              pressed={showOnlyChangedFiles}
              onPressedChange={() => onFilterToggle()}
              size="sm"
              className={`text-xs px-2 pr-3 py-0.5 h-auto ${showOnlyChangedFiles ? "border border-border bg-primary/10" : ""}`}
            >
              <GitStatusSummary
                gitStatus={gitStatus}
                changedFilesCount={changedFilesCount}
              />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>
            {showOnlyChangedFiles
              ? "Showing only changed files • Click to show all files"
              : `Show only ${changedFilesCount} changed ${changedFilesCount === 1 ? "file" : "files"}`}
          </TooltipContent>
        </Tooltip>
      )}

      {showOnlyChangedFiles && (onPull || onPush) && (
        <Separator orientation="vertical" className="h-4" />
      )}

      {showOnlyChangedFiles && (onPull || onPush) && (
        <div className="flex items-center gap-0.5">
          {onPull && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle
                  pressed={false}
                  onPressedChange={onPull}
                  disabled={isPulling || isPushing || !hasUpstream}
                  size="sm"
                  className={toggleButtonClass}
                >
                  <ArrowDownToLine
                    className={isPulling ? "animate-pulse" : ""}
                  />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>
                {!hasUpstream
                  ? "No upstream branch configured"
                  : isPulling
                    ? "Pulling..."
                    : "Pull from remote"}
              </TooltipContent>
            </Tooltip>
          )}

          {onPush && hasUpstream && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle
                  pressed={false}
                  onPressedChange={onPush}
                  disabled={isPulling || isPushing}
                  size="sm"
                  className={toggleButtonClass}
                >
                  <ArrowUpFromLine
                    className={isPushing ? "animate-pulse" : ""}
                  />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>
                {isPushing ? "Pushing..." : "Push to remote"}
              </TooltipContent>
            </Tooltip>
          )}

          {onPush && !hasUpstream && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle
                  pressed={false}
                  onPressedChange={onPush}
                  disabled={isPulling || isPushing}
                  size="sm"
                  className={toggleButtonClass}
                >
                  <Send className={isPushing ? "animate-pulse" : ""} />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>
                {isPushing ? "Publishing..." : "Publish branch"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}
