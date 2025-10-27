import { useCallback, useState } from "react";
import type { FileTreeNode } from "@shared/types";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
} from "lucide-react";

const api = window.conduit;

type FileTreeProps = {
  items: FileTreeNode[];
  onFileSelect?: (node: FileTreeNode) => void;
  rootPath: string;
};

export function FileTree({ items, onFileSelect, rootPath }: FileTreeProps) {
  return (
    <nav className="text-sm text-white/80">
      <ul className="space-y-1">
        {items.map((item) => (
          <FileTreeItem
            key={item.relativePath || item.path}
            node={item}
            onFileSelect={onFileSelect}
            rootPath={rootPath}
          />
        ))}
      </ul>
    </nav>
  );
}

type FileTreeItemProps = {
  node: FileTreeNode;
  onFileSelect?: (node: FileTreeNode) => void;
  rootPath: string;
};

type DirectoryNode = Extract<FileTreeNode, { type: "directory" }>;
type FileNode = Extract<FileTreeNode, { type: "file" }>;

function FileTreeItem({ node, onFileSelect, rootPath }: FileTreeItemProps) {
  const isDirectory = node.type === "directory";
  if (isDirectory) {
    return <DirectoryTreeItem node={node} onFileSelect={onFileSelect} rootPath={rootPath} />;
  }
  return <FileLeaf node={node} onSelect={onFileSelect} />;
}

type DirectoryTreeItemProps = {
  node: DirectoryNode;
  onFileSelect?: (node: FileTreeNode) => void;
  rootPath: string;
};

function DirectoryTreeItem({ node, onFileSelect, rootPath }: DirectoryTreeItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [children, setChildren] = useState<FileTreeNode[] | undefined>(node.children);
  
  const toggleOpen = useCallback(async () => {
    if (!isOpen && children === undefined) {
      // Need to load children
      setIsLoading(true);
      try {
        const loadedChildren = await api.getFileTree(node.path);
        setChildren(loadedChildren);
      } catch (error) {
        console.error("Failed to load directory contents:", error);
        setChildren([]);
      } finally {
        setIsLoading(false);
      }
    }
    setIsOpen((current) => !current);
  }, [isOpen, children, node.path]);
  
  const hasChildren = Array.isArray(children) && children.length > 0;
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
        {isLoading ? (
          <Loader2 className="animate-spin text-white/60" size={14} />
        ) : (
          <ArrowIcon
            className={hasChildren || children === undefined ? "text-white/60" : "text-white/25"}
            size={14}
          />
        )}
        <FolderIcon className="shrink-0 text-white/60" size={14} />
        <span className="truncate" title={node.relativePath}>
          {node.name}
        </span>
      </button>
      {isOpen && (
        <ul className="mt-1 border-l border-white/5 pl-3">
          {isLoading ? (
            <li className="pl-4 text-xs text-white/50">Loading...</li>
          ) : hasChildren ? (
            children!.map((child) => (
              <FileTreeItem
                key={child.relativePath || child.path}
                node={child}
                onFileSelect={onFileSelect}
                rootPath={rootPath}
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
