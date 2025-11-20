import type { FileTreeNode, GitFileStatus } from "@shared/types";
import { ExternalLink, FileText, Plus, Minus, RotateCcw } from "lucide-react";
import { useCallback } from "react";
import { GitStatusBadge, getStatusConfig } from "./GitStatusBadge";

type FileItemProps = {
  node: FileTreeNode;
  gitStatus?: GitFileStatus;
  onSelect?: (node: FileTreeNode) => void;
  onOpen?: (node: FileTreeNode) => void;
  onStageFile?: (relativePath: string) => void;
  onUnstageFile?: (relativePath: string) => void;
  onRevertFile?: (relativePath: string) => void;
};

export function FileItem({
  node,
  gitStatus,
  onSelect,
  onOpen,
  onStageFile,
  onUnstageFile,
  onRevertFile,
}: FileItemProps) {
  const handleClick = useCallback(() => {
    onSelect?.(node);
  }, [node, onSelect]);

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onOpen?.(node);
    },
    [node, onOpen],
  );

  const handleStage = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onStageFile?.(node.relativePath);
    },
    [node.relativePath, onStageFile],
  );

  const handleUnstage = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onUnstageFile?.(node.relativePath);
    },
    [node.relativePath, onUnstageFile],
  );

  const handleRevert = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRevertFile?.(node.relativePath);
    },
    [node.relativePath, onRevertFile],
  );

  // Get git status color for text and icon
  const config = gitStatus ? getStatusConfig(gitStatus) : null;
  const colorClass = config?.textColorClass || "text-foreground";
  const iconColorClass = config?.textColorClass || "text-foreground";

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className="group flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[13px] text-left transition hover:bg-foreground/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
      >
        <FileText className={`shrink-0 ${iconColorClass}`} size={12} />
        <span
          className={`truncate min-w-0 flex-1 ${colorClass}`}
          title={node.relativePath}
        >
          {node.name}
        </span>
        <div className="shrink-0 flex items-center gap-1">
          {/* Stage action (only for unstaged files) */}
          {onStageFile && gitStatus && !gitStatus.staged && (
            <div
              role="button"
              tabIndex={0}
              onClick={handleStage}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleStage(e as any);
                }
              }}
              className="opacity-0 group-hover:opacity-100 group-hover:text-foreground group-focus-within:opacity-100 p-1 rounded hover:bg-foreground/20 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
              title="Stage changes"
              aria-label="Stage changes"
            >
              <Plus size={12} />
            </div>
          )}

          {/* Unstage action (only for staged files) */}
          {onUnstageFile && gitStatus && gitStatus.staged && (
            <div
              role="button"
              tabIndex={0}
              onClick={handleUnstage}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleUnstage(e as any);
                }
              }}
              className="opacity-0 group-hover:opacity-100 group-hover:text-foreground group-focus-within:opacity-100 p-1 rounded hover:bg-foreground/20 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
              title="Unstage changes"
              aria-label="Unstage changes"
            >
              <Minus size={12} />
            </div>
          )}

          {/* Revert action */}
          {onRevertFile && gitStatus && (
            <div
              role="button"
              tabIndex={0}
              onClick={handleRevert}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleRevert(e as any);
                }
              }}
              className="opacity-0 group-hover:opacity-100 group-hover:text-foreground group-focus-within:opacity-100 p-1 rounded hover:bg-foreground/20 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
              title="Discard changes"
              aria-label="Discard changes"
            >
              <RotateCcw size={12} />
            </div>
          )}

          {/* Open in quick pane */}
          <div
            role="button"
            tabIndex={0}
            onClick={handleOpen}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleOpen(e as any);
              }
            }}
            className="opacity-0 group-hover:opacity-100 group-hover:text-foreground group-focus-within:opacity-100 p-1 rounded hover:bg-foreground/20 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
            title="Open in quick pane"
            aria-label="Open in quick pane"
          >
            <ExternalLink size={12} />
          </div>

          {gitStatus && (
            <div
              className="flex items-center justify-center"
              style={{ width: "16px", height: "16px" }}
            >
              <GitStatusBadge status={gitStatus} />
            </div>
          )}
        </div>
      </button>
    </li>
  );
}
