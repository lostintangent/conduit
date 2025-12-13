/**
 * Tests for the CommitReviewFileItem component.
 *
 * These tests verify the display of individual file items in commit review:
 * file path, status badge, stats, and expand/collapse behavior.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommitReviewFileItem } from "@/components/panes/editor-v2/components/CommitReviewPane/CommitReviewFileItem";
import type { CommitFile } from "@/components/panes/editor-v2/components/CommitGraph/types";
import type { GitV2API } from "@/api/GitV2API";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Wrapper component that provides tooltip context.
 */
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

function renderWithProvider(ui: React.ReactElement) {
  return render(ui, { wrapper: TestWrapper });
}

/**
 * Create a mock GitV2API.
 */
function createMockGit(): GitV2API {
  return {
    getFileAtCommit: vi.fn().mockResolvedValue("file content"),
    // Add other required methods as needed
  } as unknown as GitV2API;
}

/**
 * Create a mock CommitFile.
 */
function createMockFile(overrides: Partial<CommitFile> = {}): CommitFile {
  return {
    path: "src/index.ts",
    status: "modified",
    additions: 10,
    deletions: 5,
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("CommitReviewFileItem", () => {
  const defaultProps = {
    file: createMockFile(),
    commitId: "abc123def456",
    parentCommitId: "parent123",
    git: createMockGit(),
    isExpanded: false,
    onToggle: vi.fn(),
  };

  it("should render the component", () => {
    renderWithProvider(<CommitReviewFileItem {...defaultProps} />);

    expect(screen.getByTestId("commit-review-file-item")).toBeTruthy();
  });

  it("should display file name", () => {
    renderWithProvider(<CommitReviewFileItem {...defaultProps} />);

    // The button header should contain the file name
    expect(screen.getByTestId("file-header").textContent).toContain("index.ts");
  });

  it("should display directory path", () => {
    renderWithProvider(
      <CommitReviewFileItem
        {...defaultProps}
        file={createMockFile({ path: "src/components/Button.tsx" })}
      />,
    );

    expect(screen.getByTestId("file-header").textContent).toContain(
      "src/components/",
    );
    expect(screen.getByTestId("file-header").textContent).toContain(
      "Button.tsx",
    );
  });

  it("should display additions stat", () => {
    renderWithProvider(
      <CommitReviewFileItem
        {...defaultProps}
        file={createMockFile({ additions: 25, deletions: 0 })}
      />,
    );

    expect(screen.getByTestId("file-header").textContent).toContain("+25");
  });

  it("should display deletions stat", () => {
    renderWithProvider(
      <CommitReviewFileItem
        {...defaultProps}
        file={createMockFile({ additions: 0, deletions: 15 })}
      />,
    );

    expect(screen.getByTestId("file-header").textContent).toContain("-15");
  });

  it("should display both additions and deletions", () => {
    renderWithProvider(
      <CommitReviewFileItem
        {...defaultProps}
        file={createMockFile({ additions: 10, deletions: 5 })}
      />,
    );

    const header = screen.getByTestId("file-header");
    expect(header.textContent).toContain("+10");
    expect(header.textContent).toContain("-5");
  });

  it("should call onToggle when header is clicked", () => {
    const onToggle = vi.fn();
    renderWithProvider(
      <CommitReviewFileItem {...defaultProps} onToggle={onToggle} />,
    );

    fireEvent.click(screen.getByTestId("file-header"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("should show diff content when expanded", () => {
    renderWithProvider(
      <CommitReviewFileItem {...defaultProps} isExpanded={true} />,
    );

    expect(screen.getByTestId("file-diff")).toBeTruthy();
  });

  it("should hide diff content when collapsed", () => {
    renderWithProvider(
      <CommitReviewFileItem {...defaultProps} isExpanded={false} />,
    );

    expect(screen.queryByTestId("file-diff")).toBeFalsy();
  });

  it("should display rename info for renamed files", () => {
    renderWithProvider(
      <CommitReviewFileItem
        {...defaultProps}
        file={createMockFile({
          path: "src/newName.ts",
          status: "renamed",
          originalPath: "src/oldName.ts",
        })}
      />,
    );

    expect(screen.getByTestId("file-header").textContent).toContain(
      "src/oldName.ts",
    );
  });

  it("should handle file at root level (no directory)", () => {
    renderWithProvider(
      <CommitReviewFileItem
        {...defaultProps}
        file={createMockFile({ path: "README.md" })}
      />,
    );

    // Should show just the file name without directory prefix
    expect(screen.getByTestId("file-header").textContent).toContain(
      "README.md",
    );
  });

  it("should handle file with zero stats", () => {
    renderWithProvider(
      <CommitReviewFileItem
        {...defaultProps}
        file={createMockFile({ additions: 0, deletions: 0 })}
      />,
    );

    // Stats section should not be visible when both are 0
    const header = screen.getByTestId("file-header").textContent;
    expect(header).not.toContain("+0");
    expect(header).not.toContain("-0");
  });
});
