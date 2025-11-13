import type { FileTreeNode, GitFileStatus } from "@shared/types";
import { ExternalLink, FileText } from "lucide-react";
import { useCallback } from "react";
import { GitStatusBadge, getStatusConfig } from "./GitStatusBadge";

type FileItemProps = {
  node: FileTreeNode;
  gitStatus?: GitFileStatus;
  onSelect?: (node: FileTreeNode) => void;
  onOpen?: (node: FileTreeNode) => void;
};

export function FileItem({ node, gitStatus, onSelect, onOpen }: FileItemProps) {
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

  // Get git status color for text and icon
  const config = gitStatus ? getStatusConfig(gitStatus) : null;
  const colorClass = config
    ? config.colorClass.replace("bg-", "text-")
    : "text-white/80";
  const iconColorClass = config
    ? config.colorClass.replace("bg-", "text-")
    : "text-white/60";

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className="group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition hover:bg-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
      >
        <FileText className={`shrink-0 ${iconColorClass}`} size={14} />
        <span
          className={`truncate min-w-0 flex-1 ${colorClass}`}
          title={node.relativePath}
        >
          {node.name}
        </span>
        <div className="shrink-0 flex items-center gap-1">
          <button
            type="button"
            onClick={handleOpen}
            className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 p-1 rounded hover:bg-white/20 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
            title="Open in quick pane"
          >
            <ExternalLink className="text-white/60" size={14} />
          </button>
          {gitStatus && (
            <div
              className="flex items-center justify-center"
              style={{ width: "20px", height: "20px" }}
            >
              <GitStatusBadge status={gitStatus} />
            </div>
          )}
        </div>
      </button>
    </li>
  );
}
