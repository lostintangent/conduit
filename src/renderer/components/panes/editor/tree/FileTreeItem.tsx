import type { FileTreeNode } from "@shared/types";
import { DirectoryItem } from "./DirectoryItem";
import { FileItem } from "./FileItem";

type FileTreeItemProps = {
  node: FileTreeNode;
  onFileSelect?: (node: FileTreeNode) => void;
  onDirectoryChange?: (path: string) => void;
  onFileOpen?: (node: FileTreeNode) => void;
  rootPath: string;
};

export function FileTreeItem({ node, onFileSelect, onDirectoryChange, onFileOpen, rootPath }: FileTreeItemProps) {
  const isDirectory = node.type === "directory";
  if (isDirectory) {
    return <DirectoryItem node={node} onFileSelect={onFileSelect} onDirectoryChange={onDirectoryChange} onFileOpen={onFileOpen} rootPath={rootPath} />;
  }
  return <FileItem node={node} onSelect={onFileSelect} onOpen={onFileOpen} />;
}
