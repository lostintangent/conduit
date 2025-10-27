import type { FileTreeNode } from "@shared/types";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { useCallback, useState } from "react";
import type { KeyboardEvent } from "react";

const api = window.conduit;

type FileTreeProps = {
  items: FileTreeNode[];
  onFileSelect?: (node: FileTreeNode) => void;
  onDirectoryChange?: (path: string) => void;
  onFileOpen?: (node: FileTreeNode) => void;
  rootPath: string;
};

export function FileTree({ items, onFileSelect, onDirectoryChange, onFileOpen, rootPath }: FileTreeProps) {
  return (
    <nav className="text-sm text-white/80">
      <ul className="space-y-1">
        {items.map((item) => (
          <FileTreeItem
            key={item.relativePath || item.path}
            node={item}
            onFileSelect={onFileSelect}
            onDirectoryChange={onDirectoryChange}
            onFileOpen={onFileOpen}
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
  onDirectoryChange?: (path: string) => void;
  onFileOpen?: (node: FileTreeNode) => void;
  rootPath: string;
};

type DirectoryNode = Extract<FileTreeNode, { type: "directory" }>;
type FileNode = Extract<FileTreeNode, { type: "file" }>;

function FileTreeItem({ node, onFileSelect, onDirectoryChange, onFileOpen, rootPath }: FileTreeItemProps) {
  const isDirectory = node.type === "directory";
  if (isDirectory) {
    return <DirectoryTreeItem node={node} onFileSelect={onFileSelect} onDirectoryChange={onDirectoryChange} onFileOpen={onFileOpen} rootPath={rootPath} />;
  }
  return <FileLeaf node={node} onSelect={onFileSelect} onOpen={onFileOpen} />;
}

type DirectoryTreeItemProps = {
  node: DirectoryNode;
  onFileSelect?: (node: FileTreeNode) => void;
  onDirectoryChange?: (path: string) => void;
  onFileOpen?: (node: FileTreeNode) => void;
  rootPath: string;
};

function DirectoryTreeItem({ node, onFileSelect, onDirectoryChange, onFileOpen, rootPath }: DirectoryTreeItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [children, setChildren] = useState<FileTreeNode[] | undefined>(node.children);

  const toggleOpen = useCallback(async () => {
    if (!isOpen && children === undefined) {
      // Need to load children
      setIsLoading(true);
      try {
        const loadedChildren = await api.listDirectory(node.path);
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

  const handleChangeCwd = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDirectoryChange?.(node.path);
  }, [node.path, onDirectoryChange]);

  const handleRowKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleOpen();
    }
  }, [toggleOpen]);

  const hasChildren = Array.isArray(children) && children.length > 0;
  const ArrowIcon = isOpen ? ChevronDown : ChevronRight;
  const FolderIcon = isOpen ? FolderOpen : Folder;

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={toggleOpen}
        onKeyDown={handleRowKeyDown}
        aria-expanded={isOpen}
        className="group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-white/80 transition hover:bg-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
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
        <div className="min-w-0 flex items-center gap-1">
          <span className="min-w-0 truncate" title={node.relativePath}>
            {node.name}
          </span>
          <button
            type="button"
            onClick={handleChangeCwd}
            className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 p-1 rounded hover:bg-white/20 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 shrink-0"
            title="Change to this directory"
          >
            <FolderInput className="text-white/60" size={14} />
          </button>
        </div>
      </div>
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
                onDirectoryChange={onDirectoryChange}
                onFileOpen={onFileOpen}
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
  onOpen?: (node: FileTreeNode) => void;
};

function FileLeaf({ node, onSelect, onOpen }: FileLeafProps) {
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
