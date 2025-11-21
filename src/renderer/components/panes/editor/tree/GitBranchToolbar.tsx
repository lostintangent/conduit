import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  GitCompare,
  ArrowDownToLine,
  ArrowUpFromLine,
  Send,
  GitCommitVertical,
  SquareArrowOutUpRight,
} from "lucide-react";
import { useRef, useState } from "react";
import { GitStatusSummary } from "./GitStatusSummary";
import type { GitStatusMap } from "@shared/types";

type GitBranchToolbarProps = {
  currentBranch: string | null;
  baseBranch: string | null;
  showOnlyChangedFiles: boolean;
  isReviewModeActive?: boolean;
  changedFilesCount?: number;
  gitStatus?: GitStatusMap | null;
  onFilterToggle: () => void;
  onOpenBranchPicker: () => void;
  onPull?: () => void;
  onPush?: () => void;
  isPulling?: boolean;
  isPushing?: boolean;
  hasUpstream?: boolean;
  commitMessage?: string;
  onCommitMessageChange?: (message: string) => void;
  onCommit?: () => void;
  hasStagedFiles?: boolean;
  isCommitting?: boolean;
  onReviewChanges?: () => void;
};

export function GitBranchToolbar({
  currentBranch,
  baseBranch,
  showOnlyChangedFiles,
  isReviewModeActive = false,
  changedFilesCount = 0,
  gitStatus,
  onFilterToggle,
  onOpenBranchPicker,
  onPull,
  onPush,
  isPulling = false,
  isPushing = false,
  hasUpstream = true,
  commitMessage = "",
  onCommitMessageChange,
  onCommit,
  hasStagedFiles = false,
  isCommitting = false,
  onReviewChanges,
}: GitBranchToolbarProps) {
  const commitInputRef = useRef<HTMLInputElement>(null);
  const [isStatusHovered, setIsStatusHovered] = useState(false);

  const handleCommitClick = () => {
    if (!commitMessage.trim()) {
      // Focus input if no message
      commitInputRef.current?.focus();
      return;
    }
    onCommit?.();
  };

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
    <div className="flex flex-col">
      {/* First row: Branch info and actions */}
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
          <div className="flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle
                  pressed={showOnlyChangedFiles}
                  onPressedChange={() => onFilterToggle()}
                  onMouseEnter={() => setIsStatusHovered(true)}
                  onMouseLeave={() => setIsStatusHovered(false)}
                  size="sm"
                  className={`text-xs px-2 pr-3 py-0.5 h-auto text-foreground hover:text-foreground ${showOnlyChangedFiles ? "border border-border bg-primary/10" : ""}`}
                >
                  <GitStatusSummary
                    gitStatus={gitStatus}
                    changedFilesCount={changedFilesCount}
                    showOnlyChangedFiles={
                      showOnlyChangedFiles || isReviewModeActive
                    }
                    isHovered={isStatusHovered}
                  />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>
                {showOnlyChangedFiles
                  ? "Showing only changed files • Click to show all files"
                  : `Show only ${changedFilesCount} changed ${changedFilesCount === 1 ? "file" : "files"}`}
              </TooltipContent>
            </Tooltip>

            {!isReviewModeActive &&
              (onPull || onPush) &&
              (baseBranch === null || baseBranch === "HEAD") && (
                <div
                  className="flex items-center overflow-hidden"
                  style={{
                    maxWidth: showOnlyChangedFiles ? "200px" : "0px",
                    opacity: showOnlyChangedFiles ? 1 : 0,
                    transition: showOnlyChangedFiles
                      ? "max-width 300ms ease-out, opacity 300ms ease-out"
                      : "max-width 150ms ease-out, opacity 150ms ease-out",
                    willChange: "max-width, opacity",
                  }}
                >
                  <div
                    className="overflow-hidden"
                    style={{
                      width: showOnlyChangedFiles ? "auto" : 0,
                      marginLeft: showOnlyChangedFiles ? "0.5rem" : 0,
                      marginRight: showOnlyChangedFiles ? "0.5rem" : 0,
                      transition: showOnlyChangedFiles
                        ? "width 300ms ease-out, margin 300ms ease-out"
                        : "width 150ms ease-out, margin 150ms ease-out",
                    }}
                  >
                    <Separator orientation="vertical" className="h-4" />
                  </div>

                  <div
                    className="flex items-center gap-0.5"
                    style={{
                      transform: showOnlyChangedFiles
                        ? "translateX(0) translateZ(0)"
                        : "translateX(-8px) translateZ(0)",
                      transition: showOnlyChangedFiles
                        ? "transform 300ms ease-out"
                        : "transform 150ms ease-out",
                      willChange: "transform",
                    }}
                  >
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
                            <Send
                              className={isPushing ? "animate-pulse" : ""}
                            />
                          </Toggle>
                        </TooltipTrigger>
                        <TooltipContent>
                          {isPushing ? "Publishing..." : "Publish branch"}
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {onReviewChanges && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Toggle
                            pressed={false}
                            onPressedChange={onReviewChanges}
                            size="sm"
                            className={toggleButtonClass}
                          >
                            <SquareArrowOutUpRight />
                          </Toggle>
                        </TooltipTrigger>
                        <TooltipContent>
                          Review all changes in detail
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              )}
          </div>
        )}
      </div>

      {/* Second row: Commit message input and button */}
      {!isReviewModeActive &&
        showOnlyChangedFiles &&
        onCommit &&
        onCommitMessageChange &&
        (baseBranch === null || baseBranch === "HEAD") && (
          <div className="px-3 pb-1.5 flex items-center gap-2">
            <Input
              ref={commitInputRef}
              type="text"
              placeholder="Commit message"
              value={commitMessage}
              onChange={(e) => onCommitMessageChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleCommitClick();
                }
              }}
              disabled={isCommitting}
              className="flex-1 h-7 text-xs"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle
                  pressed={false}
                  onPressedChange={handleCommitClick}
                  disabled={!hasStagedFiles || isCommitting}
                  size="sm"
                  className={toggleButtonClass}
                >
                  <GitCommitVertical
                    className={isCommitting ? "animate-pulse" : ""}
                  />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>
                {isCommitting
                  ? "Committing..."
                  : !hasStagedFiles
                    ? "No staged files to commit"
                    : "Commit staged changes"}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
    </div>
  );
}
