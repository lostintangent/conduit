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

// Mock useSetAtom
const mockSetIsSidebarOpen = vi.fn();
vi.mock("jotai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jotai")>();
  return {
    ...actual,
    useSetAtom: () => mockSetIsSidebarOpen,
  };
});

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
vi.mock("@/components/panes/editor-v2/components/FileDiffStats", () => ({
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

// ============================================================================
// Import after mocks
// ============================================================================

import { TerminalGitStats } from "@/components/panes/terminal/shell/TerminalGitStats";

// ============================================================================
// Tests
// ============================================================================

describe("TerminalGitStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUncommittedDiffStats.mockReturnValue({
      stats: { added: 10, removed: 5, files: 3 },
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
        isGitRepo: false,
      });

      render(<TerminalGitStats cwd="/not/a/repo" />);

      expect(screen.queryByTestId("diff-stats")).toBeNull();
    });

    it("should not render when stats are null", () => {
      mockUseUncommittedDiffStats.mockReturnValue({
        stats: null,
        isGitRepo: true,
      });

      render(<TerminalGitStats cwd="/test/project" />);

      expect(screen.queryByTestId("diff-stats")).toBeNull();
    });

    it("should not render when no changes (added=0, removed=0)", () => {
      mockUseUncommittedDiffStats.mockReturnValue({
        stats: { added: 0, removed: 0, files: 0 },
        isGitRepo: true,
      });

      render(<TerminalGitStats cwd="/test/project" />);

      expect(screen.queryByTestId("diff-stats")).toBeNull();
    });

    it("should render when only additions exist", () => {
      mockUseUncommittedDiffStats.mockReturnValue({
        stats: { added: 5, removed: 0, files: 1 },
        isGitRepo: true,
      });

      render(<TerminalGitStats cwd="/test/project" />);

      expect(screen.getByTestId("diff-stats")).toBeDefined();
    });

    it("should render when only removals exist", () => {
      mockUseUncommittedDiffStats.mockReturnValue({
        stats: { added: 0, removed: 3, files: 1 },
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
    it("should open sidebar when clicked", () => {
      render(<TerminalGitStats cwd="/test/project" />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      expect(mockSetIsSidebarOpen).toHaveBeenCalledWith(true);
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

      expect(mockUseUncommittedDiffStats).toHaveBeenCalledWith(
        "/my/project",
        undefined,
      );
    });

    it("should pass sandboxId to useUncommittedDiffStats", () => {
      render(<TerminalGitStats cwd="/my/project" sandboxId="sandbox-123" />);

      expect(mockUseUncommittedDiffStats).toHaveBeenCalledWith(
        "/my/project",
        "sandbox-123",
      );
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
});
