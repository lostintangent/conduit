/**
 * Tests for the CommitFilesPanel component.
 *
 * These tests verify the container component that displays
 * the list of files changed in a commit.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommitFilesPanel } from "@/components/panes/editor-v2/components/CommitGraph/files/CommitFilesPanel";
import type { CommitFile } from "@/components/panes/editor-v2/components/CommitGraph/types";

// =============================================================================
// Test Data
// =============================================================================

function createFile(overrides: Partial<CommitFile> = {}): CommitFile {
  return {
    path: "src/index.ts",
    status: "modified",
    additions: 10,
    deletions: 5,
    isBinary: false,
    ...overrides,
  };
}

function createFiles(): CommitFile[] {
  return [
    createFile({ path: "src/index.ts", additions: 10, deletions: 5 }),
    createFile({ path: "src/utils/helper.ts", additions: 8, deletions: 3 }),
    createFile({
      path: "README.md",
      status: "added",
      additions: 20,
      deletions: 0,
    }),
  ];
}

// =============================================================================
// Tests
// =============================================================================

describe("CommitFilesPanel", () => {
  describe("loading state", () => {
    it("should display loading spinner when isLoading is true", () => {
      render(<CommitFilesPanel isLoading />);
      expect(screen.getByTestId("files-loading")).toBeTruthy();
    });

    it("should display 'Loading files...' text", () => {
      render(<CommitFilesPanel isLoading />);
      expect(screen.getByTestId("files-loading").textContent).toContain(
        "Loading files...",
      );
    });

    it("should not display file list when loading", () => {
      render(<CommitFilesPanel isLoading files={createFiles()} />);
      expect(screen.queryByTestId("commit-files-list")).toBeNull();
    });
  });

  describe("empty state", () => {
    it("should display empty state when files is undefined", () => {
      render(<CommitFilesPanel />);
      expect(screen.getByTestId("files-empty")).toBeTruthy();
    });

    it("should display empty state when files is empty array", () => {
      render(<CommitFilesPanel files={[]} />);
      expect(screen.getByTestId("files-empty")).toBeTruthy();
    });

    it("should display 'No files changed' message", () => {
      render(<CommitFilesPanel files={[]} />);
      expect(screen.getByTestId("files-empty").textContent).toBe(
        "No files changed",
      );
    });
  });

  describe("populated state", () => {
    it("should render the header", () => {
      render(<CommitFilesPanel files={createFiles()} />);
      expect(screen.getByTestId("commit-files-header")).toBeTruthy();
    });

    it("should render the file list", () => {
      render(<CommitFilesPanel files={createFiles()} />);
      expect(screen.getByTestId("commit-files-list")).toBeTruthy();
    });

    it("should render all file items", () => {
      const files = createFiles();
      render(<CommitFilesPanel files={files} />);
      expect(screen.getByTestId("commit-file-item-index.ts")).toBeTruthy();
      expect(screen.getByTestId("commit-file-item-helper.ts")).toBeTruthy();
      expect(screen.getByTestId("commit-file-item-README.md")).toBeTruthy();
    });

    it("should calculate correct totals in header", () => {
      render(<CommitFilesPanel files={createFiles()} />);
      // 10+8+20 = 38 additions, 5+3+0 = 8 deletions
      // Header uses shared DiffStatsDisplay - find by content within header
      const header = screen.getByTestId("commit-files-header");
      expect(header.textContent).toContain("+38");
      expect(header.textContent).toContain("-8");
    });

    it("should display correct file count", () => {
      render(<CommitFilesPanel files={createFiles()} />);
      expect(screen.getByTestId("file-count").textContent).toBe(
        "3 files changed",
      );
    });
  });

  describe("file selection", () => {
    it("should call onFileSelect when file is clicked", () => {
      const onFileSelect = vi.fn();
      const files = createFiles();
      render(<CommitFilesPanel files={files} onFileSelect={onFileSelect} />);

      fireEvent.click(screen.getByTestId("commit-file-item-index.ts"));

      expect(onFileSelect).toHaveBeenCalledWith(files[0]);
    });

    it("should highlight selected file", () => {
      const files = createFiles();
      render(
        <CommitFilesPanel files={files} selectedFilePath="src/index.ts" />,
      );

      const item = screen.getByTestId("commit-file-item-index.ts");
      expect(item.getAttribute("data-selected")).toBe("true");
    });

    it("should not highlight non-selected files", () => {
      const files = createFiles();
      render(
        <CommitFilesPanel files={files} selectedFilePath="src/index.ts" />,
      );

      const item = screen.getByTestId("commit-file-item-helper.ts");
      expect(item.getAttribute("data-selected")).toBe("false");
    });
  });

  describe("accessibility", () => {
    it("should have list role on file container", () => {
      render(<CommitFilesPanel files={createFiles()} />);
      const list = screen.getByTestId("commit-files-list");
      expect(list.getAttribute("role")).toBe("list");
    });

    it("should have aria-label on file list", () => {
      render(<CommitFilesPanel files={createFiles()} />);
      const list = screen.getByTestId("commit-files-list");
      expect(list.getAttribute("aria-label")).toBe("Changed files");
    });
  });

  describe("custom className", () => {
    it("should apply custom className to panel", () => {
      render(
        <CommitFilesPanel files={createFiles()} className="custom-class" />,
      );
      expect(
        screen
          .getByTestId("commit-files-panel")
          .classList.contains("custom-class"),
      ).toBe(true);
    });

    it("should apply custom className in loading state", () => {
      render(<CommitFilesPanel isLoading className="custom-class" />);
      expect(
        screen
          .getByTestId("commit-files-panel")
          .classList.contains("custom-class"),
      ).toBe(true);
    });

    it("should apply custom className in empty state", () => {
      render(<CommitFilesPanel files={[]} className="custom-class" />);
      expect(
        screen
          .getByTestId("commit-files-panel")
          .classList.contains("custom-class"),
      ).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle files without line stats", () => {
      const files: CommitFile[] = [
        {
          path: "binary.png",
          status: "modified",
          additions: 0,
          deletions: 0,
          isBinary: true,
        },
      ];
      render(<CommitFilesPanel files={files} />);
      expect(screen.getByTestId("commit-file-item-binary.png")).toBeTruthy();
      expect(screen.getByText("no line changes")).toBeTruthy();
    });

    it("should handle single file", () => {
      const files: CommitFile[] = [createFile()];
      render(<CommitFilesPanel files={files} />);
      expect(screen.getByTestId("file-count").textContent).toBe(
        "1 file changed",
      );
    });

    it("should handle files with only additions", () => {
      const files: CommitFile[] = [
        {
          path: "new.ts",
          status: "added",
          additions: 100,
          deletions: 0,
          isBinary: false,
        },
      ];
      render(<CommitFilesPanel files={files} />);
      // Uses shared DiffStatsDisplay - verify by content in header
      const header = screen.getByTestId("commit-files-header");
      expect(header.textContent).toContain("+100");
      expect(header.textContent).not.toMatch(/-\d+/);
    });

    it("should handle files with only deletions", () => {
      const files: CommitFile[] = [
        {
          path: "removed.ts",
          status: "deleted",
          additions: 0,
          deletions: 50,
          isBinary: false,
        },
      ];
      render(<CommitFilesPanel files={files} />);
      // Uses shared DiffStatsDisplay - verify by content in header
      const header = screen.getByTestId("commit-files-header");
      expect(header.textContent).toContain("-50");
      expect(header.textContent).not.toMatch(/\+\d+/);
    });
  });
});
