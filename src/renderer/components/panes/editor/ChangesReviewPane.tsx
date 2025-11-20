import { GitStatusBadge } from "./tree/GitStatusBadge";
import type { GitStatusMap, FileTreeNode } from "@shared/types";
import {
  FileIcon,
  FolderIcon,
  GitCommitVertical,
  ArrowDownToLine,
  ArrowUpFromLine,
  Send,
  Plus,
  Minus,
  RotateCcw,
  Check,
} from "lucide-react";
import { useMemo, useRef } from "react";
import path from "path-browserify";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/utils/index";

interface ChangesReviewPaneProps {
  gitStatus: GitStatusMap | null;
  cwd: string;
  onFileSelect?: (node: FileTreeNode) => void;
  commitMessage?: string;
  onCommitMessageChange?: (message: string) => void;
  onCommit?: () => void;
  hasStagedFiles?: boolean;
  isCommitting?: boolean;
  onPull?: () => void;
  onPush?: () => void;
  isPulling?: boolean;
  isPushing?: boolean;
  hasUpstream?: boolean;
  onStageFile?: (relativePath: string) => void;
  onUnstageFile?: (relativePath: string) => void;
  onRevertFile?: (relativePath: string) => void;
}

export function ChangesReviewPane({
  gitStatus,
  cwd,
  onFileSelect,
  commitMessage = "",
  onCommitMessageChange,
  onCommit,
  hasStagedFiles = false,
  isCommitting = false,
  onPull,
  onPush,
  isPulling = false,
  isPushing = false,
  hasUpstream = true,
  onStageFile,
  onUnstageFile,
  onRevertFile,
}: ChangesReviewPaneProps) {
  const commitInputRef = useRef<HTMLInputElement>(null);

  const handleCommitClick = () => {
    if (!commitMessage.trim()) {
      // Focus input if no message
      commitInputRef.current?.focus();
      return;
    }
    onCommit?.();
  };

  // Separate files by staging status
  const { stagedFiles, unstagedFiles } = useMemo(() => {
    if (!gitStatus) return { stagedFiles: [], unstagedFiles: [] };

    const staged: Array<[string, typeof gitStatus extends Map<any, infer V> ? V : never]> = [];
    const unstaged: Array<[string, typeof gitStatus extends Map<any, infer V> ? V : never]> = [];

    for (const [filePath, status] of gitStatus.entries()) {
      if (status.staged) {
        staged.push([filePath, status]);
      } else {
        unstaged.push([filePath, status]);
      }
    }

    // Sort both arrays alphabetically
    staged.sort(([a], [b]) => a.localeCompare(b));
    unstaged.sort(([a], [b]) => a.localeCompare(b));

    return { stagedFiles: staged, unstagedFiles: unstaged };
  }, [gitStatus]);

  const handleFileClick = (relativePath: string) => {
    if (onFileSelect) {
      const fullPath = path.join(cwd, relativePath);
      const node: FileTreeNode = {
        type: "file",
        name: path.basename(fullPath),
        path: fullPath,
        relativePath: relativePath,
      };
      onFileSelect(node);
    }
  };

  if (!gitStatus || gitStatus.size === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background text-muted-foreground">
        <div className="text-center">
          <div className="text-lg mb-2">No uncommitted changes</div>
          <div className="text-sm">
            All files are up to date with the repository
          </div>
        </div>
      </div>
    );
  }

  const totalFiles = gitStatus.size;

  return (
    <div className="flex flex-col flex-1 bg-background overflow-hidden">
      {/* Commit controls section */}
      {onCommit && onCommitMessageChange && (
        <div className="px-4 py-3 bg-elevated border-b border-border">
          <div className="flex items-center gap-2">
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
              className="flex-1 h-8 text-sm"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleCommitClick}
                  disabled={!hasStagedFiles || isCommitting}
                  className="px-3 py-1.5 rounded bg-primary/10 hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <GitCommitVertical
                    size={16}
                    className={isCommitting ? "animate-pulse" : ""}
                  />
                  <span className="text-sm">Commit</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {isCommitting
                  ? "Committing..."
                  : !hasStagedFiles
                    ? "No staged files to commit"
                    : "Commit staged changes"}
              </TooltipContent>
            </Tooltip>

            {(onPull || onPush) && (
              <>
                <Separator orientation="vertical" className="h-6" />
                <div className="flex items-center gap-1">
                  {onPull && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={onPull}
                          disabled={isPulling || isPushing || !hasUpstream}
                          className="p-1.5 rounded hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <ArrowDownToLine
                            size={16}
                            className={isPulling ? "animate-pulse" : ""}
                          />
                        </button>
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
                        <button
                          onClick={onPush}
                          disabled={isPulling || isPushing}
                          className="p-1.5 rounded hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <ArrowUpFromLine
                            size={16}
                            className={isPushing ? "animate-pulse" : ""}
                          />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isPushing ? "Pushing..." : "Push to remote"}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {onPush && !hasUpstream && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={onPush}
                          disabled={isPulling || isPushing}
                          className="p-1.5 rounded hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Send
                            size={16}
                            className={isPushing ? "animate-pulse" : ""}
                          />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isPushing ? "Publishing..." : "Publish branch"}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Files sections */}
      <div className="flex-1 overflow-auto">
        {/* Staged Files Section */}
        {stagedFiles.length > 0 && (
          <div className="border-b border-border">
            <div className="px-4 py-2 bg-elevated/50 text-sm font-medium flex items-center gap-2">
              <Check size={14} className="text-green-500" />
              Staged Changes ({stagedFiles.length})
              {onUnstageFile && (
                <button
                  onClick={() => {
                    // Unstage all files
                    stagedFiles.forEach(([path]) => onUnstageFile(path));
                  }}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Unstage all
                </button>
              )}
            </div>
            <div className="px-2 py-1">
              {stagedFiles.map(([filePath, status]) => (
                <div
                  key={filePath}
                  className="group flex items-center gap-2 px-2 py-1 hover:bg-foreground/5 rounded transition-colors"
                >
                  <FileIcon size={14} className="text-muted-foreground" />
                  <button
                    onClick={() => handleFileClick(filePath)}
                    className="flex-1 text-left text-sm truncate hover:text-accent transition-colors"
                    title={filePath}
                  >
                    {filePath}
                  </button>
                  <GitStatusBadge status={status.status} staged={true} />
                  {onUnstageFile && (
                    <button
                      onClick={() => onUnstageFile(filePath)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-primary/10 rounded transition-all"
                      title="Unstage file"
                    >
                      <Minus size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unstaged Files Section */}
        {unstagedFiles.length > 0 && (
          <div>
            <div className="px-4 py-2 bg-elevated/50 text-sm font-medium flex items-center gap-2">
              <Minus size={14} className="text-yellow-500" />
              Changes ({unstagedFiles.length})
              {onStageFile && (
                <button
                  onClick={() => {
                    // Stage all files
                    unstagedFiles.forEach(([path]) => onStageFile(path));
                  }}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Stage all
                </button>
              )}
            </div>
            <div className="px-2 py-1">
              {unstagedFiles.map(([filePath, status]) => (
                <div
                  key={filePath}
                  className="group flex items-center gap-2 px-2 py-1 hover:bg-foreground/5 rounded transition-colors"
                >
                  <FileIcon size={14} className="text-muted-foreground" />
                  <button
                    onClick={() => handleFileClick(filePath)}
                    className="flex-1 text-left text-sm truncate hover:text-accent transition-colors"
                    title={filePath}
                  >
                    {filePath}
                  </button>
                  <GitStatusBadge status={status.status} staged={false} />
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onStageFile && (
                      <button
                        onClick={() => onStageFile(filePath)}
                        className="p-1 hover:bg-primary/10 rounded transition-colors"
                        title="Stage file"
                      >
                        <Plus size={14} />
                      </button>
                    )}
                    {onRevertFile && status.status !== "untracked" && (
                      <button
                        onClick={() => {
                          if (confirm(`Discard changes to ${filePath}?`)) {
                            onRevertFile(filePath);
                          }
                        }}
                        className="p-1 hover:bg-red-500/10 rounded transition-colors text-red-400"
                        title="Discard changes"
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Summary footer */}
      <div className="px-4 py-2 bg-elevated/30 border-t border-border text-xs text-muted-foreground">
        {stagedFiles.length > 0 && (
          <span className="text-green-500">
            {stagedFiles.length} staged
          </span>
        )}
        {stagedFiles.length > 0 && unstagedFiles.length > 0 && (
          <span className="mx-2">•</span>
        )}
        {unstagedFiles.length > 0 && (
          <span className="text-yellow-500">
            {unstagedFiles.length} unstaged
          </span>
        )}
        <span className="mx-2">•</span>
        <span>{totalFiles} total changes</span>
      </div>
    </div>
  );
}