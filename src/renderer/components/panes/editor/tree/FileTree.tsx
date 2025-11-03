import type { FileTreeNode } from "@shared/types";
import { FileTreeItem } from "./FileTreeItem";

type FileTreeProps = {
  items: FileTreeNode[];
  onFileSelect?: (node: FileTreeNode) => void;
  onDirectoryChange?: (path: string) => void;
  onFileOpen?: (node: FileTreeNode) => void;
  rootPath: string;
};

export function FileTree({
  items,
  onFileSelect,
  onDirectoryChange,
  onFileOpen,
  rootPath,
}: FileTreeProps) {
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
