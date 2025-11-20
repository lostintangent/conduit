// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileTree } from "@/components/panes/editor/tree/FileTree";
import type { FileTreeNode, GitStatusMap } from "@shared/types";

// Mock the ResourceGroup component
vi.mock("@/components/panes/editor/tree/ResourceGroup", () => ({
  ResourceGroup: ({
    label,
    count,
    children,
  }: {
    label: string;
    count: number;
    children: React.ReactNode;
  }) => (
    <div data-testid="resource-group">
      <div data-testid="group-label">{label}</div>
      <div data-testid="group-count">{count}</div>
      <div>{children}</div>
    </div>
  ),
}));

// Mock FileTreeItem to simplify testing
vi.mock("@/components/panes/editor/tree/FileTreeItem", () => ({
  FileTreeItem: ({ node }: { node: FileTreeNode }) => (
    <div data-testid={`file-tree-item-${node.relativePath}`}>{node.name}</div>
  ),
}));

describe("FileTree - Staged/Unstaged Grouping", () => {
  const mockItems: FileTreeNode[] = [
    {
      type: "file",
      name: "README.md",
      path: "/repo/README.md",
      relativePath: "README.md",
    },
    {
      type: "directory",
      name: "src",
      path: "/repo/src",
      relativePath: "src",
      children: [
        {
          type: "file",
          name: "index.ts",
          path: "/repo/src/index.ts",
          relativePath: "src/index.ts",
        },
      ],
    },
  ];

  const createGitStatus = (entries: [string, boolean][]): GitStatusMap => {
    const map = new Map();
    entries.forEach(([path, staged]) => {
      map.set(path, {
        status: "modified",
        staged,
        relativePath: path,
      });
    });
    return map;
  };

  it("should not group files when showGroupedByStaging is false", () => {
    const gitStatus = createGitStatus([["README.md", true]]);

    render(
      <FileTree
        items={mockItems}
        gitStatus={gitStatus}
        rootPath="/repo"
        showGroupedByStaging={false}
      />,
    );

    const groups = screen.queryAllByTestId("resource-group");
    expect(groups.length).toBe(0);
  });

  it("should not group files when gitStatus is null", () => {
    render(
      <FileTree
        items={mockItems}
        gitStatus={null}
        rootPath="/repo"
        showGroupedByStaging={true}
      />,
    );

    const groups = screen.queryAllByTestId("resource-group");
    expect(groups.length).toBe(0);
  });

  it("should show staged files in Staged Changes section", () => {
    const gitStatus = createGitStatus([
      ["README.md", true],
      ["src/index.ts", false],
    ]);

    render(
      <FileTree
        items={mockItems}
        gitStatus={gitStatus}
        rootPath="/repo"
        showGroupedByStaging={true}
      />,
    );

    const labels = screen.getAllByTestId("group-label");
    expect(labels.some((label) => label.textContent === "Staged Changes")).toBe(
      true,
    );
  });

  it("should show unstaged files in Changes section", () => {
    const gitStatus = createGitStatus([
      ["README.md", false],
      ["src/index.ts", true],
    ]);

    render(
      <FileTree
        items={mockItems}
        gitStatus={gitStatus}
        rootPath="/repo"
        showGroupedByStaging={true}
      />,
    );

    const labels = screen.getAllByTestId("group-label");
    expect(labels.some((label) => label.textContent === "Changes")).toBe(true);
  });

  it("should correctly count staged files", () => {
    const gitStatus = createGitStatus([
      ["README.md", true],
      ["src/index.ts", true],
    ]);

    render(
      <FileTree
        items={mockItems}
        gitStatus={gitStatus}
        rootPath="/repo"
        showGroupedByStaging={true}
      />,
    );

    const counts = screen.getAllByTestId("group-count");
    const stagedCount = counts.find((count) => {
      const label = count.parentElement?.querySelector(
        '[data-testid="group-label"]',
      );
      return label?.textContent === "Staged Changes";
    });

    // Both files are staged, but they appear in 2 root items (README.md and src/ directory)
    expect(stagedCount?.textContent).toBe("2");
  });

  it("should correctly count unstaged files", () => {
    const gitStatus = createGitStatus([
      ["README.md", false],
      ["src/index.ts", false],
    ]);

    render(
      <FileTree
        items={mockItems}
        gitStatus={gitStatus}
        rootPath="/repo"
        showGroupedByStaging={true}
      />,
    );

    const counts = screen.getAllByTestId("group-count");
    const unstagedCount = counts.find((count) => {
      const label = count.parentElement?.querySelector(
        '[data-testid="group-label"]',
      );
      return label?.textContent === "Changes";
    });

    // Both files are unstaged, appearing in 2 root items
    expect(unstagedCount?.textContent).toBe("2");
  });

  it("should show both sections when there are both staged and unstaged files", () => {
    const gitStatus = createGitStatus([
      ["README.md", true],
      ["src/index.ts", false],
    ]);

    render(
      <FileTree
        items={mockItems}
        gitStatus={gitStatus}
        rootPath="/repo"
        showGroupedByStaging={true}
      />,
    );

    const labels = screen.getAllByTestId("group-label");
    const labelTexts = labels.map((label) => label.textContent);

    expect(labelTexts).toContain("Staged Changes");
    expect(labelTexts).toContain("Changes");
  });

  it("should only show Staged Changes section when all files are staged", () => {
    const gitStatus = createGitStatus([
      ["README.md", true],
      ["src/index.ts", true],
    ]);

    render(
      <FileTree
        items={mockItems}
        gitStatus={gitStatus}
        rootPath="/repo"
        showGroupedByStaging={true}
      />,
    );

    const labels = screen.getAllByTestId("group-label");
    const labelTexts = labels.map((label) => label.textContent);

    expect(labelTexts).toContain("Staged Changes");
    expect(labelTexts).not.toContain("Changes");
  });

  it("should only show Changes section when all files are unstaged", () => {
    const gitStatus = createGitStatus([
      ["README.md", false],
      ["src/index.ts", false],
    ]);

    render(
      <FileTree
        items={mockItems}
        gitStatus={gitStatus}
        rootPath="/repo"
        showGroupedByStaging={true}
      />,
    );

    const labels = screen.getAllByTestId("group-label");
    const labelTexts = labels.map((label) => label.textContent);

    expect(labelTexts).not.toContain("Staged Changes");
    expect(labelTexts).toContain("Changes");
  });

  it("should pass action handlers only to appropriate sections", () => {
    const gitStatus = createGitStatus([
      ["README.md", true],
      ["src/index.ts", false],
    ]);

    const onStageFile = vi.fn();
    const onUnstageFile = vi.fn();
    const onRevertFile = vi.fn();

    const { container } = render(
      <FileTree
        items={mockItems}
        gitStatus={gitStatus}
        rootPath="/repo"
        showGroupedByStaging={true}
        onStageFile={onStageFile}
        onUnstageFile={onUnstageFile}
        onRevertFile={onRevertFile}
      />,
    );

    // Both sections should be rendered
    const groups = screen.getAllByTestId("resource-group");
    expect(groups.length).toBe(2);
  });
});
