import { describe, expect, it } from "vitest";
import type { FileTreeNode } from "@shared/types";

// Extract the filtering logic to test it independently
// Note: This is a shallow filter - it only filters the root level
// DirectoryItem handles filtering its own children when they're loaded
function filterTreeByGitStatus(
  nodes: FileTreeNode[],
  statusMap: Map<string, unknown>,
): FileTreeNode[] {
  return nodes.filter((node) => {
    if (node.type === "file") {
      // Only show files that have git status
      return statusMap.has(node.relativePath);
    } else {
      // For directories, check if any changed files exist under this path
      const dirPath = node.relativePath;
      for (const [filePath] of statusMap) {
        if (
          filePath.startsWith(dirPath + "/") ||
          filePath.startsWith(dirPath + "\\")
        ) {
          return true;
        }
      }
      return false;
    }
  });
}

describe("filterTreeByGitStatus", () => {
  it("should filter out files without git status", () => {
    const tree: FileTreeNode[] = [
      {
        name: "changed.txt",
        path: "/repo/changed.txt",
        relativePath: "changed.txt",
        type: "file",
      },
      {
        name: "unchanged.txt",
        path: "/repo/unchanged.txt",
        relativePath: "unchanged.txt",
        type: "file",
      },
    ];

    const gitStatus = new Map([["changed.txt", { status: "modified" }]]);

    const result = filterTreeByGitStatus(tree, gitStatus);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("changed.txt");
  });

  it("should show directory with changed files", () => {
    const tree: FileTreeNode[] = [
      {
        name: "src",
        path: "/repo/src",
        relativePath: "src",
        type: "directory",
        children: [
          {
            name: "changed.ts",
            path: "/repo/src/changed.ts",
            relativePath: "src/changed.ts",
            type: "file",
          },
          {
            name: "unchanged.ts",
            path: "/repo/src/unchanged.ts",
            relativePath: "src/unchanged.ts",
            type: "file",
          },
        ],
      },
    ];

    const gitStatus = new Map([["src/changed.ts", { status: "modified" }]]);

    const result = filterTreeByGitStatus(tree, gitStatus);

    // Shallow filter - directory is shown, but children filtering happens in DirectoryItem
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("src");
  });

  it("should hide directory with no changed files", () => {
    const tree: FileTreeNode[] = [
      {
        name: "src",
        path: "/repo/src",
        relativePath: "src",
        type: "directory",
        children: [
          {
            name: "unchanged1.ts",
            path: "/repo/src/unchanged1.ts",
            relativePath: "src/unchanged1.ts",
            type: "file",
          },
          {
            name: "unchanged2.ts",
            path: "/repo/src/unchanged2.ts",
            relativePath: "src/unchanged2.ts",
            type: "file",
          },
        ],
      },
    ];

    const gitStatus = new Map([["other/file.ts", { status: "modified" }]]);

    const result = filterTreeByGitStatus(tree, gitStatus);

    expect(result).toHaveLength(0);
  });

  it("should show directory with deeply nested changes", () => {
    const tree: FileTreeNode[] = [
      {
        name: "src",
        path: "/repo/src",
        relativePath: "src",
        type: "directory",
        children: [
          {
            name: "renderer",
            path: "/repo/src/renderer",
            relativePath: "src/renderer",
            type: "directory",
            children: [
              {
                name: "store",
                path: "/repo/src/renderer/store",
                relativePath: "src/renderer/store",
                type: "directory",
                children: [
                  {
                    name: "unchanged.ts",
                    path: "/repo/src/renderer/store/unchanged.ts",
                    relativePath: "src/renderer/store/unchanged.ts",
                    type: "file",
                  },
                ],
              },
              {
                name: "changed.ts",
                path: "/repo/src/renderer/changed.ts",
                relativePath: "src/renderer/changed.ts",
                type: "file",
              },
            ],
          },
        ],
      },
    ];

    const gitStatus = new Map([
      ["src/renderer/changed.ts", { status: "modified" }],
    ]);

    const result = filterTreeByGitStatus(tree, gitStatus);

    // Shallow filter - only checks if "src" has changes underneath
    // DirectoryItem will filter children recursively when they're displayed
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("src");
  });

  it("should show directory with changes deep inside (children not loaded)", () => {
    const tree: FileTreeNode[] = [
      {
        name: "src",
        path: "/repo/src",
        relativePath: "src",
        type: "directory",
        // children undefined - not loaded yet
      },
    ];

    const gitStatus = new Map([
      ["src/renderer/store/actions.ts", { status: "modified" }],
    ]);

    const result = filterTreeByGitStatus(tree, gitStatus);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("src");
    expect(result[0].children).toBeUndefined();
  });

  it("should hide directory with no changes (children not loaded)", () => {
    const tree: FileTreeNode[] = [
      {
        name: "src",
        path: "/repo/src",
        relativePath: "src",
        type: "directory",
      },
      {
        name: "tests",
        path: "/repo/tests",
        relativePath: "tests",
        type: "directory",
      },
    ];

    const gitStatus = new Map([["src/changed.ts", { status: "modified" }]]);

    const result = filterTreeByGitStatus(tree, gitStatus);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("src");
  });

  it("should show directory with changes in any subdirectory", () => {
    const tree: FileTreeNode[] = [
      {
        name: "src",
        path: "/repo/src",
        relativePath: "src",
        type: "directory",
        children: [
          {
            name: "loaded",
            path: "/repo/src/loaded",
            relativePath: "src/loaded",
            type: "directory",
            children: [
              {
                name: "file.ts",
                path: "/repo/src/loaded/file.ts",
                relativePath: "src/loaded/file.ts",
                type: "file",
              },
            ],
          },
          {
            name: "unloaded",
            path: "/repo/src/unloaded",
            relativePath: "src/unloaded",
            type: "directory",
            // children undefined
          },
        ],
      },
    ];

    const gitStatus = new Map([
      ["src/loaded/file.ts", { status: "modified" }],
      ["src/unloaded/other.ts", { status: "added" }],
    ]);

    const result = filterTreeByGitStatus(tree, gitStatus);

    // Shallow filter - only checks root level "src" directory
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("src");
  });

  it("should handle root-level files", () => {
    const tree: FileTreeNode[] = [
      {
        name: "README.md",
        path: "/repo/README.md",
        relativePath: "README.md",
        type: "file",
      },
      {
        name: "package.json",
        path: "/repo/package.json",
        relativePath: "package.json",
        type: "file",
      },
    ];

    const gitStatus = new Map([["README.md", { status: "modified" }]]);

    const result = filterTreeByGitStatus(tree, gitStatus);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("README.md");
  });

  it("should handle empty git status", () => {
    const tree: FileTreeNode[] = [
      {
        name: "file.ts",
        path: "/repo/file.ts",
        relativePath: "file.ts",
        type: "file",
      },
    ];

    const gitStatus = new Map();

    const result = filterTreeByGitStatus(tree, gitStatus);

    expect(result).toHaveLength(0);
  });

  it("should handle Windows-style paths", () => {
    const tree: FileTreeNode[] = [
      {
        name: "src",
        path: "C:\\repo\\src",
        relativePath: "src",
        type: "directory",
      },
    ];

    const gitStatus = new Map([
      ["src\\renderer\\app.tsx", { status: "modified" }],
    ]);

    const result = filterTreeByGitStatus(tree, gitStatus);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("src");
  });
});
