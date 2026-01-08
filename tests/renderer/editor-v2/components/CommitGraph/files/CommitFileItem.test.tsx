/**
 * Tests for the CommitFileItem component.
 *
 * These tests verify the display and interaction of individual
 * file items in the commit file list.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommitFileItem } from "@/components/panes/editor-v2/components/CommitGraph/files/CommitFileItem";
import type { CommitFile } from "@/components/panes/editor-v2/components/CommitGraph/types";

// =============================================================================
// Test Data
// =============================================================================

function createFile(overrides: Partial<CommitFile> = {}): CommitFile {
  return {
    path: "src/components/Button.tsx",
    status: "modified",
    additions: 10,
    deletions: 5,
    isBinary: false,
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("CommitFileItem", () => {
  describe("rendering", () => {
    it("should render the file name", () => {
      render(<CommitFileItem file={createFile()} />);
      expect(screen.getByText("Button.tsx")).toBeTruthy();
    });

    it("should render the folder path", () => {
      render(<CommitFileItem file={createFile()} />);
      expect(screen.getByText("src/components")).toBeTruthy();
    });

    it("should render file at root without folder path", () => {
      render(<CommitFileItem file={createFile({ path: "README.md" })} />);
      expect(screen.getByText("README.md")).toBeTruthy();
      // No folder path should be rendered
      expect(screen.queryByText("src")).toBeNull();
    });

    it("should render the status badge", () => {
      render(<CommitFileItem file={createFile()} />);
      // Uses shared GitBadge component
      expect(screen.getByTestId("git-badge")).toBeTruthy();
    });

    it("should set data-testid with file name", () => {
      render(<CommitFileItem file={createFile()} />);
      expect(screen.getByTestId("commit-file-item-Button.tsx")).toBeTruthy();
    });

    it("should set data-filepath attribute", () => {
      render(<CommitFileItem file={createFile()} />);
      const item = screen.getByTestId("commit-file-item-Button.tsx");
      expect(item.getAttribute("data-filepath")).toBe(
        "src/components/Button.tsx",
      );
    });
  });

  describe("line statistics", () => {
    // DiffStatsDisplay is used for stats - verify by content
    it("should display additions and deletions", () => {
      render(
        <CommitFileItem file={createFile({ additions: 12, deletions: 3 })} />,
      );
      expect(screen.getByText("+12")).toBeTruthy();
      expect(screen.getByText("-3")).toBeTruthy();
    });

    it("should display only additions when no deletions", () => {
      render(
        <CommitFileItem file={createFile({ additions: 5, deletions: 0 })} />,
      );
      expect(screen.getByText("+5")).toBeTruthy();
      expect(screen.queryByText("-0")).toBeNull();
    });

    it("should display only deletions when no additions", () => {
      render(
        <CommitFileItem file={createFile({ additions: 0, deletions: 8 })} />,
      );
      expect(screen.getByText("-8")).toBeTruthy();
      expect(screen.queryByText("+0")).toBeNull();
    });

    it("should not display stats when zero values", () => {
      render(
        <CommitFileItem file={createFile({ additions: 0, deletions: 0 })} />,
      );
      // No stats rendered when both are 0
      expect(screen.queryByText(/^\+\d/)).toBeNull();
      expect(screen.queryByText(/^-\d/)).toBeNull();
    });
  });

  describe("renamed files", () => {
    it("should show rename in tooltip", () => {
      const file = createFile({
        path: "src/new-name.ts",
        originalPath: "src/old-name.ts",
        status: "renamed",
      });
      render(<CommitFileItem file={file} />);
      const item = screen.getByTestId("commit-file-item-new-name.ts");
      expect(item.getAttribute("title")).toBe(
        "src/old-name.ts → src/new-name.ts",
      );
    });
  });

  describe("selection state", () => {
    it("should set data-selected to false by default", () => {
      render(<CommitFileItem file={createFile()} />);
      const item = screen.getByTestId("commit-file-item-Button.tsx");
      expect(item.getAttribute("data-selected")).toBe("false");
    });

    it("should set data-selected to true when selected", () => {
      render(<CommitFileItem file={createFile()} isSelected />);
      const item = screen.getByTestId("commit-file-item-Button.tsx");
      expect(item.getAttribute("data-selected")).toBe("true");
    });
  });

  describe("click handling", () => {
    it("should call onClick with file when clicked", () => {
      const onClick = vi.fn();
      const file = createFile();
      render(<CommitFileItem file={file} onClick={onClick} />);

      fireEvent.click(screen.getByTestId("commit-file-item-Button.tsx"));

      expect(onClick).toHaveBeenCalledWith(file);
    });

    it("should not throw when clicked without onClick handler", () => {
      render(<CommitFileItem file={createFile()} />);
      expect(() => {
        fireEvent.click(screen.getByTestId("commit-file-item-Button.tsx"));
      }).not.toThrow();
    });
  });

  describe("keyboard handling", () => {
    it("should call onClick on Enter key", () => {
      const onClick = vi.fn();
      const file = createFile();
      render(<CommitFileItem file={file} onClick={onClick} />);

      fireEvent.keyDown(screen.getByTestId("commit-file-item-Button.tsx"), {
        key: "Enter",
      });

      expect(onClick).toHaveBeenCalledWith(file);
    });

    it("should call onClick on Space key", () => {
      const onClick = vi.fn();
      const file = createFile();
      render(<CommitFileItem file={file} onClick={onClick} />);

      fireEvent.keyDown(screen.getByTestId("commit-file-item-Button.tsx"), {
        key: " ",
      });

      expect(onClick).toHaveBeenCalledWith(file);
    });
  });

  describe("custom className", () => {
    it("should apply custom className", () => {
      render(<CommitFileItem file={createFile()} className="custom-class" />);
      const item = screen.getByTestId("commit-file-item-Button.tsx");
      expect(item.classList.contains("custom-class")).toBe(true);
    });
  });

  describe("different statuses", () => {
    // Uses shared GitBadge component
    it("should render added file", () => {
      render(<CommitFileItem file={createFile({ status: "added" })} />);
      const badge = screen.getByTestId("git-badge");
      expect(badge.getAttribute("data-status")).toBe("added");
    });

    it("should render deleted file", () => {
      render(<CommitFileItem file={createFile({ status: "deleted" })} />);
      const badge = screen.getByTestId("git-badge");
      expect(badge.getAttribute("data-status")).toBe("deleted");
    });

    it("should render copied file", () => {
      render(<CommitFileItem file={createFile({ status: "copied" })} />);
      const badge = screen.getByTestId("git-badge");
      expect(badge.getAttribute("data-status")).toBe("copied");
    });
  });
});
