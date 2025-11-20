// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { GitBranchToolbar } from "@/components/panes/editor/tree/GitBranchToolbar";

// Mock the tooltip component to avoid testing library issues
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe("GitBranchToolbar - Commit Functionality", () => {
  const defaultProps = {
    currentBranch: "main",
    baseBranch: null,
    showOnlyChangedFiles: true,
    changedFilesCount: 3,
    gitStatus: new Map([
      [
        "file1.ts",
        { status: "modified", staged: true, relativePath: "file1.ts" },
      ],
      [
        "file2.ts",
        { status: "added", staged: false, relativePath: "file2.ts" },
      ],
    ]),
    onFilterToggle: vi.fn(),
    onOpenBranchPicker: vi.fn(),
    onPull: vi.fn(),
    onPush: vi.fn(),
    isPulling: false,
    isPushing: false,
    hasUpstream: true,
    commitMessage: "",
    onCommitMessageChange: vi.fn(),
    onCommit: vi.fn(),
    hasStagedFiles: true,
    isCommitting: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render commit input when showOnlyChangedFiles is true", () => {
    render(<GitBranchToolbar {...defaultProps} />);

    const input = screen.getByPlaceholderText("Commit message");
    expect(input).toBeDefined();
  });

  it("should not render commit input when showOnlyChangedFiles is false", () => {
    render(<GitBranchToolbar {...defaultProps} showOnlyChangedFiles={false} />);

    const input = screen.queryByPlaceholderText("Commit message");
    expect(input).toBeNull();
  });

  it("should call onCommitMessageChange when typing in input", () => {
    const onCommitMessageChange = vi.fn();
    render(
      <GitBranchToolbar
        {...defaultProps}
        onCommitMessageChange={onCommitMessageChange}
      />,
    );

    const input = screen.getByPlaceholderText("Commit message");
    fireEvent.change(input, { target: { value: "Fix bug" } });

    expect(onCommitMessageChange).toHaveBeenCalledWith("Fix bug");
  });

  it("should call onCommit when Enter key is pressed with message", () => {
    const onCommit = vi.fn();
    render(
      <GitBranchToolbar
        {...defaultProps}
        commitMessage="Fix bug"
        onCommit={onCommit}
      />,
    );

    const input = screen.getByPlaceholderText("Commit message");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCommit).toHaveBeenCalled();
  });

  it("should not call onCommit when Enter key is pressed without message", () => {
    const onCommit = vi.fn();
    render(
      <GitBranchToolbar
        {...defaultProps}
        commitMessage=""
        onCommit={onCommit}
      />,
    );

    const input = screen.getByPlaceholderText("Commit message");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("should not call onCommit when Shift+Enter is pressed", () => {
    const onCommit = vi.fn();
    render(
      <GitBranchToolbar
        {...defaultProps}
        commitMessage="Fix bug"
        onCommit={onCommit}
      />,
    );

    const input = screen.getByPlaceholderText("Commit message");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("should disable commit button when no staged files", () => {
    render(<GitBranchToolbar {...defaultProps} hasStagedFiles={false} />);

    const buttons = screen.getAllByRole("button");
    const commitButton = buttons.find((btn) =>
      btn.querySelector("svg[class*='lucide-git-commit']"),
    );

    expect(commitButton?.disabled).toBe(true);
  });

  it("should disable commit button when committing", () => {
    render(<GitBranchToolbar {...defaultProps} isCommitting={true} />);

    const buttons = screen.getAllByRole("button");
    const commitButton = buttons.find((btn) =>
      btn.querySelector("svg[class*='lucide-git-commit']"),
    );

    expect(commitButton?.disabled).toBe(true);
  });

  it("should enable commit button when has staged files and not committing", () => {
    render(
      <GitBranchToolbar
        {...defaultProps}
        hasStagedFiles={true}
        isCommitting={false}
      />,
    );

    const buttons = screen.getAllByRole("button");
    const commitButton = buttons.find((btn) =>
      btn.querySelector("svg[class*='lucide-git-commit']"),
    );

    expect(commitButton?.disabled).toBe(false);
  });

  it("should disable input when committing", () => {
    render(<GitBranchToolbar {...defaultProps} isCommitting={true} />);

    const input = screen.getByPlaceholderText("Commit message");
    expect(input.disabled).toBe(true);
  });

  it("should call onCommit when commit button is clicked with message", async () => {
    const onCommit = vi.fn();
    render(
      <GitBranchToolbar
        {...defaultProps}
        commitMessage="Fix bug"
        onCommit={onCommit}
      />,
    );

    const buttons = screen.getAllByRole("button");
    const commitButton = buttons.find((btn) =>
      btn.querySelector("svg[class*='lucide-git-commit']"),
    );

    if (commitButton) {
      fireEvent.click(commitButton);
      await waitFor(() => {
        expect(onCommit).toHaveBeenCalled();
      });
    }
  });

  it("should focus input when commit button is clicked without message", async () => {
    const onCommit = vi.fn();
    render(
      <GitBranchToolbar
        {...defaultProps}
        commitMessage=""
        onCommit={onCommit}
      />,
    );

    const input = screen.getByPlaceholderText("Commit message");
    const buttons = screen.getAllByRole("button");
    const commitButton = buttons.find((btn) =>
      btn.querySelector("svg[class*='lucide-git-commit']"),
    );

    if (commitButton) {
      fireEvent.click(commitButton);
      await waitFor(() => {
        expect(document.activeElement).toBe(input);
      });
    }
  });
});
