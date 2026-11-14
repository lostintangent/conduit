// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

// Mock useUncommittedDiffStats
const mockUseUncommittedDiffStats = vi.fn();
vi.mock("@/hooks/useUncommittedDiffStats", () => ({
  useUncommittedDiffStats: (...args: unknown[]) =>
    mockUseUncommittedDiffStats(...args),
}));

// Mock useCommand
const mockToggleSidebarCmd = {
  id: "view.toggleSidebar",
  title: "Toggle Sidebar",
  keybinding: "Cmd+B",
};
vi.mock("@/commands/hooks/useCommand", () => ({
  useCommand: () => mockToggleSidebarCmd,
  getCommandDisplayTitle: () => "Toggle Sidebar (⌘B)",
}));

// Mock tooltip components
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip">{children}</div>
  ),
  TooltipTrigger: ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div data-testid="tooltip-trigger">{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}));

// Mock DiffStatsDisplay
vi.mock("@/components/panes/editor/components/FileDiffStats", () => ({
  DiffStatsDisplay: ({
    stats,
  }: {
    stats: { added: number; removed: number };
  }) => (
    <span data-testid="diff-stats">
      +{stats.added} -{stats.removed}
    </span>
  ),
}));

// Mock GitStatusSummary
vi.mock(
  "@/components/panes/editor/components/FileTreePanel/GitStatusSummary",
  () => ({
    GitStatusSummary: ({
      gitStatus,
      changedFilesCount,
      isHovered,
    }: {
      gitStatus: Map<string, unknown>;
      changedFilesCount: number;
      isHovered?: boolean;
    }) => (
      <span data-testid="git-status-summary" data-hovered={isHovered}>
        {changedFilesCount} files
      </span>
    ),
  }),
);

// Mock Separator
vi.mock("@/components/ui/separator", () => ({
  Separator: () => <span data-testid="separator">|</span>,
}));

// ============================================================================
// Import after mocks
// ============================================================================

import { TerminalGitStats } from "@features/terminal/components/shell/TerminalGitStats";
import { sidebarStateAtom } from "@/store/sidebarStore";

// ============================================================================
// Tests
// ============================================================================

describe("TerminalGitStats", () => {
  const mockGitStatus = new Map([
    [
      "src/file1.ts",
      { status: "modified", staged: false, path: "src/file1.ts" },
    ],
    ["src/file2.ts", { status: "added", staged: true, path: "src/file2.ts" }],
    [
      "src/file3.ts",
      { status: "modified", staged: false, path: "src/file3.ts" },
    ],
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUncommittedDiffStats.mockReturnValue({
      stats: { added: 10, removed: 5, files: 3 },
      gitStatus: mockGitStatus,
      isGitRepo: true,
    });
  });

  // ===========================================================================
  // Rendering Conditions
  // ===========================================================================

  describe("rendering conditions", () => {
    it("should render when cwd is a git repo with changes", () => {
      render(<TerminalGitStats cwd="/test/project" />);

      expect(screen.getByTestId("diff-stats")).toBeDefined();
      expect(screen.getByText("+10 -5")).toBeDefined();
    });

    it("should not render when cwd is null", () => {
      render(<TerminalGitStats cwd={null} />);

      expect(screen.queryByTestId("diff-stats")).toBeNull();
    });

    it("should not render when not a git repo", () => {
      mockUseUncommittedDiffStats.mockReturnValue({
        stats: null,
        gitStatus: null,
        isGitRepo: false,
      });

      render(<TerminalGitStats cwd="/not/a/repo" />);

      expect(screen.queryByTestId("diff-stats")).toBeNull();
    });

    it("should not render when stats are null", () => {
      mockUseUncommittedDiffStats.mockReturnValue({
        stats: null,
        gitStatus: null,
        isGitRepo: true,
      });

      render(<TerminalGitStats cwd="/test/project" />);

      expect(screen.queryByTestId("diff-stats")).toBeNull();
    });

    it("should not render when no changes (added=0, removed=0, no gitStatus)", () => {
      mockUseUncommittedDiffStats.mockReturnValue({
        stats: { added: 0, removed: 0, files: 0 },
        gitStatus: new Map(),
        isGitRepo: true,
      });

      render(<TerminalGitStats cwd="/test/project" />);

      expect(screen.queryByTestId("diff-stats")).toBeNull();
    });

    it("should render when only additions exist", () => {
      mockUseUncommittedDiffStats.mockReturnValue({
        stats: { added: 5, removed: 0, files: 1 },
        gitStatus: new Map([["file.ts", { status: "added" }]]),
        isGitRepo: true,
      });

      render(<TerminalGitStats cwd="/test/project" />);

      expect(screen.getByTestId("diff-stats")).toBeDefined();
    });

    it("should render when only removals exist", () => {
      mockUseUncommittedDiffStats.mockReturnValue({
        stats: { added: 0, removed: 3, files: 1 },
        gitStatus: new Map([["file.ts", { status: "deleted" }]]),
        isGitRepo: true,
      });

      render(<TerminalGitStats cwd="/test/project" />);

      expect(screen.getByTestId("diff-stats")).toBeDefined();
    });

    it("should render when gitStatus has files but diff stats are zero", () => {
      mockUseUncommittedDiffStats.mockReturnValue({
        stats: { added: 0, removed: 0, files: 1 },
        gitStatus: new Map([["file.ts", { status: "untracked" }]]),
        isGitRepo: true,
      });

      render(<TerminalGitStats cwd="/test/project" />);

      expect(screen.getByTestId("diff-stats")).toBeDefined();
    });
  });

  // ===========================================================================
  // Click Handler
  // ===========================================================================

  describe("click handler", () => {
    it("should open sidebar with editor view and changes mode when clicked", () => {
      render(<TerminalGitStats cwd="/test/project" />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      expect(sidebarStateAtom.get()).toEqual({
        isOpen: true,
        view: "editor",
        navigation: { cwd: "/test/project", editorTreeMode: "changes" },
      });
    });
  });

  // ===========================================================================
  // Tooltip
  // ===========================================================================

  describe("tooltip", () => {
    it("should render tooltip with command display title", () => {
      render(<TerminalGitStats cwd="/test/project" />);

      expect(screen.getByTestId("tooltip")).toBeDefined();
      expect(screen.getByTestId("tooltip-content")).toBeDefined();
      expect(screen.getByText("Toggle Sidebar (⌘B)")).toBeDefined();
    });
  });

  // ===========================================================================
  // Hook Integration
  // ===========================================================================

  describe("hook integration", () => {
    it("should pass cwd to useUncommittedDiffStats", () => {
      render(<TerminalGitStats cwd="/my/project" />);

      expect(mockUseUncommittedDiffStats).toHaveBeenCalledWith("/my/project");
    });
  });

  // ===========================================================================
  // Styling
  // ===========================================================================

  describe("styling", () => {
    it("should render as a button element", () => {
      render(<TerminalGitStats cwd="/test/project" />);

      const button = screen.getByRole("button");
      expect(button).toBeDefined();
      expect(button.tagName).toBe("BUTTON");
    });

    it("should have positioning classes", () => {
      render(<TerminalGitStats cwd="/test/project" />);

      const button = screen.getByRole("button");
      expect(button.className).toContain("absolute");
      expect(button.className).toContain("top-3");
      expect(button.className).toContain("right-3");
    });
  });

  // ===========================================================================
  // GitStatusSummary Integration
  // ===========================================================================

  describe("GitStatusSummary integration", () => {
    it("should render GitStatusSummary when gitStatus has files", () => {
      render(<TerminalGitStats cwd="/test/project" />);

      expect(screen.getByTestId("git-status-summary")).toBeDefined();
      expect(screen.getByText("3 files")).toBeDefined();
    });

    it("should render separator between DiffStatsDisplay and GitStatusSummary", () => {
      render(<TerminalGitStats cwd="/test/project" />);

      expect(screen.getByTestId("separator")).toBeDefined();
    });

    it("should not render GitStatusSummary when gitStatus is empty", () => {
      mockUseUncommittedDiffStats.mockReturnValue({
        stats: { added: 10, removed: 5, files: 0 },
        gitStatus: new Map(),
        isGitRepo: true,
      });

      render(<TerminalGitStats cwd="/test/project" />);

      expect(screen.queryByTestId("git-status-summary")).toBeNull();
      expect(screen.queryByTestId("separator")).toBeNull();
    });

    it("should not render GitStatusSummary when gitStatus is null", () => {
      mockUseUncommittedDiffStats.mockReturnValue({
        stats: { added: 10, removed: 5, files: 0 },
        gitStatus: null,
        isGitRepo: true,
      });

      render(<TerminalGitStats cwd="/test/project" />);

      expect(screen.queryByTestId("git-status-summary")).toBeNull();
    });
  });

  // ===========================================================================
  // Hover Behavior
  // ===========================================================================

  describe("hover behavior", () => {
    it("should pass isHovered=false to GitStatusSummary initially", () => {
      render(<TerminalGitStats cwd="/test/project" />);

      const summary = screen.getByTestId("git-status-summary");
      expect(summary.getAttribute("data-hovered")).toBe("false");
    });

    it("should pass isHovered=true to GitStatusSummary on mouse enter", () => {
      render(<TerminalGitStats cwd="/test/project" />);

      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);

      const summary = screen.getByTestId("git-status-summary");
      expect(summary.getAttribute("data-hovered")).toBe("true");
    });

    it("should pass isHovered=false to GitStatusSummary on mouse leave", () => {
      render(<TerminalGitStats cwd="/test/project" />);

      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      fireEvent.mouseLeave(button);

      const summary = screen.getByTestId("git-status-summary");
      expect(summary.getAttribute("data-hovered")).toBe("false");
    });
  });
});
