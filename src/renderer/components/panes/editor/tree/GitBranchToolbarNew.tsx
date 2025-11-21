import type { TreeViewMode } from "@/components/panes/editor/EditorPane";
import { DiffStat } from "@/components/ui/diff-stat";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowRight,
  Files,
  FileSearch,
  GitBranch,
  GitCompare,
} from "lucide-react";

type GitBranchToolbarProps = {
  currentBranch: string | null;
  baseBranch: string | null;
  treeViewMode: TreeViewMode;
  changedFilesCount?: number;
  diffStats?: { added: number; removed: number };
  onTreeViewModeChange: (mode: TreeViewMode) => void;
  onOpenBranchPicker: () => void;
  onReviewChanges?: () => void;
};

export function GitBranchToolbar({
  currentBranch,
  baseBranch,
  treeViewMode,
  changedFilesCount = 0,
  diffStats,
  onTreeViewModeChange,
  onOpenBranchPicker,
  onReviewChanges,
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
    <div className="flex flex-col">
      {/* First row: Files/Changes mode selector */}
      <div className="px-3 py-2">
        <SegmentedControl
          value={treeViewMode}
          onChange={onTreeViewModeChange}
          options={[
            {
              value: "files" as TreeViewMode,
              label: "Files",
              icon: <Files size={14} />,
              tooltip: "Show all files",
            },
            {
              value: "changes" as TreeViewMode,
              label: "Changes",
              icon: <GitBranch size={14} />,
              tooltip: `Show ${changedFilesCount} changed ${changedFilesCount === 1 ? "file" : "files"}`,
            },
          ]}
          size="sm"
        />
      </div>

      {/* Second row: Branch comparison and review button (only in changes mode) */}
      {treeViewMode === "changes" && onReviewChanges && (
        <div className="flex flex-col">
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
          </div>

          <div className="px-3 py-1.5 text-xs flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onReviewChanges}
                  className="group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-left transition hover:bg-foreground/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
                >
                  <FileSearch size={14} />
                  <span>Review changes ({changedFilesCount})</span>
                  {diffStats && (
                    <DiffStat
                      added={diffStats.added}
                      removed={diffStats.removed}
                      className="ml-auto"
                      showLabels={true}
                    />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                View all uncommitted changes in one place
                {diffStats && (
                  <div className="mt-1 text-xs opacity-80">
                    {diffStats.added} additions, {diffStats.removed} deletions
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );
}
