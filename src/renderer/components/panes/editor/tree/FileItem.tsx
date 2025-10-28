import type { FileTreeNode } from "@shared/types";
import { ExternalLink, FileText } from "lucide-react";
import { useCallback } from "react";

type FileItemProps = {
  node: FileTreeNode;
  onSelect?: (node: FileTreeNode) => void;
  onOpen?: (node: FileTreeNode) => void;
};

export function FileItem({ node, onSelect, onOpen }: FileItemProps) {
  const handleClick = useCallback(() => {
    onSelect?.(node);
  }, [node, onSelect]);

  const handleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onOpen?.(node);
  }, [node, onOpen]);

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className="group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-white/80 transition hover:bg-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
      >
        <FileText className="shrink-0 text-white/60" size={14} />
        <span className="truncate min-w-0 flex-1" title={node.relativePath}>
          {node.name}
        </span>
        <button
          type="button"
          onClick={handleOpen}
          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 p-1 rounded hover:bg-white/20 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 shrink-0"
          title="Open in quick pane"
        >
          <ExternalLink className="text-white/60" size={14} />
        </button>
      </button>
    </li>
  );
}
