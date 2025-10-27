import { useCallback, useState } from "react";
import type { FileTreeNode } from "@shared/types";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";

type FileTreeProps = {
  items: FileTreeNode[];
  onFileSelect?: (node: FileTreeNode) => void;
};

export function FileTree({ items, onFileSelect }: FileTreeProps) {
  return (
    <nav className="text-sm text-white/80">
      <ul className="space-y-1">
        {items.map((item) => (
          <FileTreeItem
            key={item.relativePath || item.path}
            node={item}
            onFileSelect={onFileSelect}
          />
        ))}
      </ul>
    </nav>
  );
}

type FileTreeItemProps = {
  node: FileTreeNode;
  onFileSelect?: (node: FileTreeNode) => void;
};

type DirectoryNode = Extract<FileTreeNode, { type: "directory" }>;
type FileNode = Extract<FileTreeNode, { type: "file" }>;

function FileTreeItem({ node, onFileSelect }: FileTreeItemProps) {
  const isDirectory = node.type === "directory";
  if (isDirectory) {
    return <DirectoryTreeItem node={node} onFileSelect={onFileSelect} />;
  }
  return <FileLeaf node={node} onSelect={onFileSelect} />;
}

type DirectoryTreeItemProps = {
  node: DirectoryNode;
  onFileSelect?: (node: FileTreeNode) => void;
};

function DirectoryTreeItem({ node, onFileSelect }: DirectoryTreeItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const toggleOpen = useCallback(() => {
    setIsOpen((current) => !current);
  }, []);
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const ArrowIcon = isOpen ? ChevronDown : ChevronRight;
  const FolderIcon = isOpen ? FolderOpen : Folder;

  return (
    <li>
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-white/80 transition hover:bg-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
      >
        <ArrowIcon
          className={hasChildren ? "text-white/60" : "text-white/25"}
          size={14}
        />
        <FolderIcon className="shrink-0 text-white/60" size={14} />
        <span className="truncate" title={node.relativePath}>
          {node.name}
        </span>
      </button>
      {isOpen && (
        <ul className="mt-1 border-l border-white/5 pl-3">
          {hasChildren ? (
            node.children!.map((child) => (
              <FileTreeItem
                key={child.relativePath || child.path}
                node={child}
                onFileSelect={onFileSelect}
              />
            ))
          ) : (
            <li className="pl-4 text-xs text-white/50">Empty directory</li>
          )}
        </ul>
      )}
    </li>
  );
}

type FileLeafProps = {
  node: FileNode;
  onSelect?: (node: FileTreeNode) => void;
};

function FileLeaf({ node, onSelect }: FileLeafProps) {
  const handleClick = useCallback(() => {
    onSelect?.(node);
  }, [node, onSelect]);

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-white/80 transition hover:bg-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
      >
        <FileText className="shrink-0 text-white/60" size={14} />
        <span className="truncate" title={node.relativePath}>
          {node.name}
        </span>
      </button>
    </li>
  );
}
