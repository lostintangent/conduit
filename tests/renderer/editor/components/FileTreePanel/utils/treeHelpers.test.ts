/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import type { GitFileStatus } from "@/api/GitV2API";
import {
  getDirectoryPath,
  buildFolderTree,
  buildVisualOrderFromTree,
  expandFoldersToFiles,
  buildFlatVisualOrder,
} from "../../../../../../src/renderer/components/panes/editor/components/FileTreePanel/utils/treeHelpers";

/** Suffix for unstaged entries in partially staged files */
const UNSTAGED_KEY_SUFFIX = "\0unstaged";

/**
 * Helper to create a mock GitFileStatus object for testing.
 */
function mockStatus(
  path: string,
  status: "modified" | "added" | "deleted" | "untracked" = "modified",
  staged = false,
): GitFileStatus {
  return { path, status, staged };
}

// ============================================================================
// getDirectoryPath
// ============================================================================

describe("getDirectoryPath", () => {
  it("should return empty string for root-level files", () => {
    expect(getDirectoryPath("file.ts")).toBe("");
    expect(getDirectoryPath("README.md")).toBe("");
  });

  it("should return parent directory for nested files", () => {
    expect(getDirectoryPath("src/index.ts")).toBe("src");
    expect(getDirectoryPath("src/utils/helpers.ts")).toBe("src/utils");
  });

  it("should handle deeply nested paths", () => {
    expect(getDirectoryPath("a/b/c/d/e/file.ts")).toBe("a/b/c/d/e");
  });

  it("should handle files with dots in directory names", () => {
    expect(getDirectoryPath("src/components.v2/Button.tsx")).toBe(
      "src/components.v2",
    );
  });
});

// ============================================================================
// buildFolderTree
// ============================================================================

describe("buildFolderTree", () => {
  it("should create correct folder hierarchy for nested files", () => {
    const files: Array<[string, GitFileStatus]> = [
      ["src/index.ts", mockStatus("src/index.ts", "modified")],
      ["src/utils/helpers.ts", mockStatus("src/utils/helpers.ts", "added")],
    ];

    const tree = buildFolderTree(files);

    // Should have 'src' folder at root
    expect(tree.has("src")).toBe(true);

    const srcFolder = tree.get("src")!;
    expect(srcFolder.name).toBe("src");
    expect(srcFolder.path).toBe("src");
    expect(srcFolder.files).toHaveLength(1);
    expect(srcFolder.files[0].name).toBe("index.ts");

    // Should have 'utils' subfolder
    expect(srcFolder.folders.has("utils")).toBe(true);
    const utilsFolder = srcFolder.folders.get("utils")!;
    expect(utilsFolder.files).toHaveLength(1);
    expect(utilsFolder.files[0].name).toBe("helpers.ts");
  });

  it("should handle root-level files", () => {
    const files: Array<[string, GitFileStatus]> = [
      ["README.md", mockStatus("README.md", "modified")],
      ["package.json", mockStatus("package.json", "modified")],
    ];

    const tree = buildFolderTree(files);

    // Root-level files go into a virtual "" folder
    expect(tree.has("")).toBe(true);
    const rootFolder = tree.get("")!;
    expect(rootFolder.files).toHaveLength(2);
    expect(rootFolder.files.map((f) => f.name).sort()).toEqual([
      "README.md",
      "package.json",
    ]);
  });

  it("should handle mixed root and nested files", () => {
    const files: Array<[string, GitFileStatus]> = [
      ["README.md", mockStatus("README.md", "modified")],
      ["src/index.ts", mockStatus("src/index.ts", "added")],
    ];

    const tree = buildFolderTree(files);

    // Should have root folder with README.md
    expect(tree.has("")).toBe(true);
    expect(tree.get("")!.files).toHaveLength(1);

    // Should have src folder
    expect(tree.has("src")).toBe(true);
    expect(tree.get("src")!.files).toHaveLength(1);
  });

  it("should preserve git status on files", () => {
    const files: Array<[string, GitFileStatus]> = [
      ["src/added.ts", mockStatus("src/added.ts", "added")],
      ["src/modified.ts", mockStatus("src/modified.ts", "modified")],
      ["src/deleted.ts", mockStatus("src/deleted.ts", "deleted")],
    ];

    const tree = buildFolderTree(files);
    const srcFolder = tree.get("src")!;

    const addedFile = srcFolder.files.find((f) => f.name === "added.ts");
    const modifiedFile = srcFolder.files.find((f) => f.name === "modified.ts");
    const deletedFile = srcFolder.files.find((f) => f.name === "deleted.ts");

    expect(addedFile?.status.status).toBe("added");
    expect(modifiedFile?.status.status).toBe("modified");
    expect(deletedFile?.status.status).toBe("deleted");
  });

  it("should handle deeply nested folder structures", () => {
    const files: Array<[string, GitFileStatus]> = [
      ["a/b/c/d/file.ts", mockStatus("a/b/c/d/file.ts", "modified")],
    ];

    const tree = buildFolderTree(files);

    expect(tree.has("a")).toBe(true);
    const a = tree.get("a")!;
    expect(a.folders.has("b")).toBe(true);
    const b = a.folders.get("b")!;
    expect(b.folders.has("c")).toBe(true);
    const c = b.folders.get("c")!;
    expect(c.folders.has("d")).toBe(true);
    const d = c.folders.get("d")!;
    expect(d.files).toHaveLength(1);
    expect(d.files[0].name).toBe("file.ts");
  });

  it("should store both mapKey and path on file entries", () => {
    const files: Array<[string, GitFileStatus]> = [
      ["src/index.ts", mockStatus("src/index.ts", "modified")],
    ];

    const tree = buildFolderTree(files);
    const srcFolder = tree.get("src")!;
    const file = srcFolder.files[0];

    // When mapKey equals path, both should have same value
    expect(file.mapKey).toBe("src/index.ts");
    expect(file.path).toBe("src/index.ts");
    expect(file.name).toBe("index.ts");
  });

  it("should store separate mapKey and path for partially staged files", () => {
    // For partially staged files, mapKey includes a suffix but path is the actual file path
    const stagedMapKey = "src/index.ts";
    const unstagedMapKey = `src/index.ts${UNSTAGED_KEY_SUFFIX}`;

    const files: Array<[string, GitFileStatus]> = [
      [stagedMapKey, mockStatus("src/index.ts", "modified", true)],
      [unstagedMapKey, mockStatus("src/index.ts", "modified", false)],
    ];

    const tree = buildFolderTree(files);
    const srcFolder = tree.get("src")!;

    // Should have two file entries for the same path
    expect(srcFolder.files).toHaveLength(2);

    const stagedFile = srcFolder.files.find((f) => f.mapKey === stagedMapKey);
    const unstagedFile = srcFolder.files.find(
      (f) => f.mapKey === unstagedMapKey,
    );

    // Both should have the same actual path
    expect(stagedFile?.path).toBe("src/index.ts");
    expect(unstagedFile?.path).toBe("src/index.ts");

    // But different mapKeys
    expect(stagedFile?.mapKey).toBe(stagedMapKey);
    expect(unstagedFile?.mapKey).toBe(unstagedMapKey);
  });
});

// ============================================================================
// buildVisualOrderFromTree
// ============================================================================

describe("buildVisualOrderFromTree", () => {
  it("should return correct order for expanded folders", () => {
    const files: Array<[string, GitFileStatus]> = [
      ["src/index.ts", mockStatus("src/index.ts", "modified")],
      ["src/utils.ts", mockStatus("src/utils.ts", "modified")],
    ];

    const tree = buildFolderTree(files);
    const expandedFolders = new Set(["src"]);

    const order = buildVisualOrderFromTree(tree, expandedFolders);

    expect(order).toEqual([
      { path: "src", type: "folder" },
      { path: "src/index.ts", type: "file" },
      { path: "src/utils.ts", type: "file" },
    ]);
  });

  it("should exclude children of collapsed folders", () => {
    const files: Array<[string, GitFileStatus]> = [
      ["src/index.ts", mockStatus("src/index.ts", "modified")],
      ["src/utils.ts", mockStatus("src/utils.ts", "modified")],
    ];

    const tree = buildFolderTree(files);
    const expandedFolders = new Set<string>(); // Nothing expanded

    const order = buildVisualOrderFromTree(tree, expandedFolders);

    // Should only include folder, not its children
    expect(order).toEqual([{ path: "src", type: "folder" }]);
  });

  it("should order folders alphabetically", () => {
    const files: Array<[string, GitFileStatus]> = [
      ["zebra/file.ts", mockStatus("zebra/file.ts", "modified")],
      ["alpha/file.ts", mockStatus("alpha/file.ts", "modified")],
      ["mike/file.ts", mockStatus("mike/file.ts", "modified")],
    ];

    const tree = buildFolderTree(files);
    const expandedFolders = new Set<string>();

    const order = buildVisualOrderFromTree(tree, expandedFolders);

    expect(order.map((item) => item.path)).toEqual(["alpha", "mike", "zebra"]);
  });

  it("should order files alphabetically within folders", () => {
    const files: Array<[string, GitFileStatus]> = [
      ["src/z-file.ts", mockStatus("src/z-file.ts", "modified")],
      ["src/a-file.ts", mockStatus("src/a-file.ts", "modified")],
      ["src/m-file.ts", mockStatus("src/m-file.ts", "modified")],
    ];

    const tree = buildFolderTree(files);
    const expandedFolders = new Set(["src"]);

    const order = buildVisualOrderFromTree(tree, expandedFolders);

    expect(order).toEqual([
      { path: "src", type: "folder" },
      { path: "src/a-file.ts", type: "file" },
      { path: "src/m-file.ts", type: "file" },
      { path: "src/z-file.ts", type: "file" },
    ]);
  });

  it("should place root-level files after folders", () => {
    const files: Array<[string, GitFileStatus]> = [
      ["README.md", mockStatus("README.md", "modified")],
      ["src/index.ts", mockStatus("src/index.ts", "modified")],
    ];

    const tree = buildFolderTree(files);
    const expandedFolders = new Set<string>();

    const order = buildVisualOrderFromTree(tree, expandedFolders);

    expect(order).toEqual([
      { path: "src", type: "folder" },
      { path: "README.md", type: "file" },
    ]);
  });

  it("should handle nested expanded folders correctly", () => {
    const files: Array<[string, GitFileStatus]> = [
      [
        "src/components/Button.tsx",
        mockStatus("src/components/Button.tsx", "modified"),
      ],
      ["src/index.ts", mockStatus("src/index.ts", "modified")],
    ];

    const tree = buildFolderTree(files);
    const expandedFolders = new Set(["src", "src/components"]);

    const order = buildVisualOrderFromTree(tree, expandedFolders);

    expect(order).toEqual([
      { path: "src", type: "folder" },
      { path: "src/components", type: "folder" },
      { path: "src/components/Button.tsx", type: "file" },
      { path: "src/index.ts", type: "file" },
    ]);
  });

  it("should not show nested folder children if parent is collapsed", () => {
    const files: Array<[string, GitFileStatus]> = [
      [
        "src/components/Button.tsx",
        mockStatus("src/components/Button.tsx", "modified"),
      ],
    ];

    const tree = buildFolderTree(files);
    // Only nested folder expanded, but parent is collapsed
    const expandedFolders = new Set(["src/components"]);

    const order = buildVisualOrderFromTree(tree, expandedFolders);

    // Parent collapsed, so we only see the parent folder
    expect(order).toEqual([{ path: "src", type: "folder" }]);
  });

  it("should use mapKey for file paths in visual order", () => {
    // When mapKey equals path, the output path should be the mapKey
    const files: Array<[string, GitFileStatus]> = [
      ["src/index.ts", mockStatus("src/index.ts", "modified")],
    ];

    const tree = buildFolderTree(files);
    const expandedFolders = new Set(["src"]);

    const order = buildVisualOrderFromTree(tree, expandedFolders);

    // The file's path in visual order should be its mapKey
    const fileItem = order.find((item) => item.type === "file");
    expect(fileItem?.path).toBe("src/index.ts");
  });

  it("should use mapKey (with suffix) for partially staged files in visual order", () => {
    // For partially staged files, mapKey has a suffix but path is the actual file path
    const stagedMapKey = "src/index.ts";
    const unstagedMapKey = `src/index.ts${UNSTAGED_KEY_SUFFIX}`;

    const files: Array<[string, GitFileStatus]> = [
      [stagedMapKey, mockStatus("src/index.ts", "modified", true)],
      [unstagedMapKey, mockStatus("src/index.ts", "modified", false)],
    ];

    const tree = buildFolderTree(files);
    const expandedFolders = new Set(["src"]);

    const order = buildVisualOrderFromTree(tree, expandedFolders);

    // Should have folder + 2 file entries
    expect(order).toHaveLength(3);
    expect(order[0]).toEqual({ path: "src", type: "folder" });

    // The files should use mapKey as their path (for multi-select tracking)
    const filePaths = order
      .filter((item) => item.type === "file")
      .map((item) => item.path);
    expect(filePaths).toContain(stagedMapKey);
    expect(filePaths).toContain(unstagedMapKey);
  });
});

// ============================================================================
// expandFoldersToFiles
// ============================================================================

describe("expandFoldersToFiles", () => {
  const allFilePaths = [
    "src/index.ts",
    "src/utils.ts",
    "src/components/Button.tsx",
    "src/components/Input.tsx",
    "README.md",
  ];

  it("should return file paths unchanged", () => {
    const selected = new Set(["src/index.ts", "README.md"]);

    const result = expandFoldersToFiles(selected, allFilePaths);

    expect(result.sort()).toEqual(["README.md", "src/index.ts"]);
  });

  it("should expand folder to all contained files", () => {
    const selected = new Set(["src/components"]);

    const result = expandFoldersToFiles(selected, allFilePaths);

    expect(result.sort()).toEqual([
      "src/components/Button.tsx",
      "src/components/Input.tsx",
    ]);
  });

  it("should expand parent folder to include nested files", () => {
    const selected = new Set(["src"]);

    const result = expandFoldersToFiles(selected, allFilePaths);

    expect(result.sort()).toEqual([
      "src/components/Button.tsx",
      "src/components/Input.tsx",
      "src/index.ts",
      "src/utils.ts",
    ]);
  });

  it("should handle mixed file and folder selections", () => {
    const selected = new Set(["src/components", "README.md"]);

    const result = expandFoldersToFiles(selected, allFilePaths);

    expect(result.sort()).toEqual([
      "README.md",
      "src/components/Button.tsx",
      "src/components/Input.tsx",
    ]);
  });

  it("should deduplicate when folder and contained file both selected", () => {
    const selected = new Set(["src/components", "src/components/Button.tsx"]);

    const result = expandFoldersToFiles(selected, allFilePaths);

    // Should not have duplicates
    expect(result.sort()).toEqual([
      "src/components/Button.tsx",
      "src/components/Input.tsx",
    ]);
  });

  it("should return empty array for empty selection", () => {
    const selected = new Set<string>();

    const result = expandFoldersToFiles(selected, allFilePaths);

    expect(result).toEqual([]);
  });
});

// ============================================================================
// buildFlatVisualOrder
// ============================================================================

describe("buildFlatVisualOrder", () => {
  it("should combine staged and unstaged files", () => {
    const stagedFiles: Array<[string, GitFileStatus]> = [
      ["staged1.ts", mockStatus("staged1.ts", "added", true)],
      ["staged2.ts", mockStatus("staged2.ts", "modified", true)],
    ];
    const unstagedFiles: Array<[string, GitFileStatus]> = [
      ["unstaged1.ts", mockStatus("unstaged1.ts", "modified")],
      ["unstaged2.ts", mockStatus("unstaged2.ts", "deleted")],
    ];

    const result = buildFlatVisualOrder(stagedFiles, unstagedFiles);

    expect(result).toEqual([
      { path: "staged1.ts", type: "file" },
      { path: "staged2.ts", type: "file" },
      { path: "unstaged1.ts", type: "file" },
      { path: "unstaged2.ts", type: "file" },
    ]);
  });

  it("should maintain order within each section", () => {
    const stagedFiles: Array<[string, GitFileStatus]> = [
      ["z-file.ts", mockStatus("z-file.ts", "added", true)],
      ["a-file.ts", mockStatus("a-file.ts", "added", true)],
    ];
    const unstagedFiles: Array<[string, GitFileStatus]> = [];

    const result = buildFlatVisualOrder(stagedFiles, unstagedFiles);

    // Order should be preserved as passed in
    expect(result.map((item) => item.path)).toEqual(["z-file.ts", "a-file.ts"]);
  });

  it("should handle empty staged files", () => {
    const stagedFiles: Array<[string, GitFileStatus]> = [];
    const unstagedFiles: Array<[string, GitFileStatus]> = [
      ["file.ts", mockStatus("file.ts", "modified")],
    ];

    const result = buildFlatVisualOrder(stagedFiles, unstagedFiles);

    expect(result).toEqual([{ path: "file.ts", type: "file" }]);
  });

  it("should handle empty unstaged files", () => {
    const stagedFiles: Array<[string, GitFileStatus]> = [
      ["file.ts", mockStatus("file.ts", "added", true)],
    ];
    const unstagedFiles: Array<[string, GitFileStatus]> = [];

    const result = buildFlatVisualOrder(stagedFiles, unstagedFiles);

    expect(result).toEqual([{ path: "file.ts", type: "file" }]);
  });

  it("should return all items as type file", () => {
    const stagedFiles: Array<[string, GitFileStatus]> = [
      ["src/index.ts", mockStatus("src/index.ts", "added", true)],
    ];
    const unstagedFiles: Array<[string, GitFileStatus]> = [
      ["src/utils.ts", mockStatus("src/utils.ts", "modified")],
    ];

    const result = buildFlatVisualOrder(stagedFiles, unstagedFiles);

    expect(result.every((item) => item.type === "file")).toBe(true);
  });
});
