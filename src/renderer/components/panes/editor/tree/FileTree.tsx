import type { FileTreeNode, GitStatusMap } from "@shared/types";
import { FileTreeItem } from "./FileTreeItem";

type FileTreeProps = {
  items: FileTreeNode[];
  gitStatus?: GitStatusMap | null;
  onFileSelect?: (node: FileTreeNode) => void;
  onDirectoryChange?: (path: string) => void;
  onFileOpen?: (node: FileTreeNode) => void;
  rootPath: string;
  expandedPaths?: Set<string> | null;
  onManualExpansionToggle?: (path: string, isExpanded: boolean) => void;
  isFiltering?: boolean;
  treeVersion?: number;
};

export function FileTree({
  items,
  gitStatus,
  onFileSelect,
  onDirectoryChange,
  onFileOpen,
  rootPath,
  expandedPaths,
  onManualExpansionToggle,
  isFiltering,
  treeVersion,
}: FileTreeProps) {
  return (
    <nav className="text-sm text-white/80">
      <ul className="space-y-1">
        {items.map((item) => (
          <FileTreeItem
            key={item.relativePath || item.path}
            node={item}
            gitStatus={gitStatus}
            onFileSelect={onFileSelect}
            onDirectoryChange={onDirectoryChange}
            onFileOpen={onFileOpen}
            rootPath={rootPath}
            expandedPaths={expandedPaths}
            onManualExpansionToggle={onManualExpansionToggle}
            isFiltering={isFiltering}
            treeVersion={treeVersion}
            prefetch={item.type === "directory"}
          />
        ))}
      </ul>
    </nav>
  );
}
