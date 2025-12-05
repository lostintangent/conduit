// @ts-nocheck
/**
 * @vitest-environment jsdom
 *
 * BranchSelector tests - Tests for branch selector dropdown component.
 *
 * Tests cover:
 * - BranchSelector component loading states
 * - Dropdown behavior
 * - Branch selection
 * - Local branch filtering (remote branches excluded)
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { BranchSelector } from "../../../../../src/renderer/components/panes/editor-v2/components/FileTreePanel/BranchSelector";
import { TooltipProvider } from "../../../../../src/renderer/components/ui/tooltip";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Wrapper to provide TooltipProvider context for tests.
 */
function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

// ============================================================================
// Mocks
// ============================================================================

// Mock useGitV2 hook
const mockGitApi = {
  getBranches: vi.fn(),
  getCurrentBranch: vi.fn(),
  onBranchChanged: vi.fn(),
  whenReady: vi.fn(),
};

vi.mock("@/hooks/useGitV2", () => ({
  useGitV2: () => mockGitApi,
}));

// Mock useGitAvailable hook
vi.mock("@/hooks/useGitAvailable", () => ({
  useGitAvailable: () => ({ isAvailable: true, isLoading: false }),
}));

// ============================================================================
// Test Data
// ============================================================================

const mockBranches = [
  { name: "main", isRemote: false, isCurrent: false },
  { name: "feature/new-feature", isRemote: false, isCurrent: true },
  { name: "develop", isRemote: false, isCurrent: false },
  { name: "origin/main", isRemote: true, isCurrent: false },
  { name: "origin/develop", isRemote: true, isCurrent: false },
];

// ============================================================================
// BranchSelector Tests
// ============================================================================

describe("BranchSelector", () => {
  const defaultProps = {
    cwd: "/test/project",
    baseBranch: null,
    onBaseBranchChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGitApi.getBranches.mockResolvedValue(mockBranches);
    mockGitApi.getCurrentBranch.mockResolvedValue("feature/new-feature");
    mockGitApi.onBranchChanged.mockReturnValue(() => {});
    mockGitApi.whenReady.mockResolvedValue(undefined);
  });

  describe("Loading State", () => {
    it("shows loading indicator while fetching branches", () => {
      // Never resolve to keep loading state
      mockGitApi.getBranches.mockImplementation(() => new Promise(() => {}));

      renderWithProviders(<BranchSelector {...defaultProps} />);

      expect(screen.getByTestId("branch-selector-loading")).toBeDefined();
      expect(screen.getByText("Loading...")).toBeDefined();
    });
  });

  describe("Initial Render", () => {
    it("renders trigger button with placeholder text when no branch selected", async () => {
      renderWithProviders(<BranchSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      expect(screen.getByText("Compare to...")).toBeDefined();
    });

    it("renders trigger button with selected branch name when baseBranch is set", async () => {
      renderWithProviders(
        <BranchSelector {...defaultProps} baseBranch="main" />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      expect(screen.getByText("main")).toBeDefined();
    });

    it("shows clear button when a branch is selected", async () => {
      renderWithProviders(
        <BranchSelector {...defaultProps} baseBranch="main" />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector-clear")).toBeDefined();
      });
    });
  });

  describe("Dropdown Behavior", () => {
    it("opens dropdown when trigger is clicked", async () => {
      renderWithProviders(<BranchSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-trigger"));
      });

      expect(screen.getByTestId("branch-selector-dropdown")).toBeDefined();
    });

    it("closes dropdown when clicking outside", async () => {
      renderWithProviders(<BranchSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-trigger"));
      });

      expect(screen.getByTestId("branch-selector-dropdown")).toBeDefined();

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-backdrop"));
      });

      expect(screen.queryByTestId("branch-selector-dropdown")).toBeNull();
    });

    it("excludes current branch from dropdown options", async () => {
      renderWithProviders(<BranchSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-trigger"));
      });

      // Current branch is "feature/new-feature", should not be shown
      expect(
        screen.queryByTestId("branch-option-feature/new-feature"),
      ).toBeNull();

      // Other local branches should be shown
      expect(screen.getByTestId("branch-option-main")).toBeDefined();
      expect(screen.getByTestId("branch-option-develop")).toBeDefined();
    });

    it("excludes remote branches from dropdown (only local branches shown)", async () => {
      renderWithProviders(<BranchSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-trigger"));
      });

      // Remote branches should NOT be shown
      expect(screen.queryByTestId("branch-option-origin/main")).toBeNull();
      expect(screen.queryByTestId("branch-option-origin/develop")).toBeNull();

      // Local branches should be shown
      expect(screen.getByTestId("branch-option-main")).toBeDefined();
      expect(screen.getByTestId("branch-option-develop")).toBeDefined();
    });
  });

  describe("Branch Selection", () => {
    it("calls onBaseBranchChange when a branch is selected", async () => {
      const onBaseBranchChange = vi.fn();
      renderWithProviders(
        <BranchSelector
          {...defaultProps}
          onBaseBranchChange={onBaseBranchChange}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-trigger"));
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-option-main"));
      });

      expect(onBaseBranchChange).toHaveBeenCalledWith("main");
    });

    it("closes dropdown after selecting a branch", async () => {
      renderWithProviders(<BranchSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-trigger"));
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-option-main"));
      });

      expect(screen.queryByTestId("branch-selector-dropdown")).toBeNull();
    });

    it("calls onBaseBranchChange with null when clear button is clicked", async () => {
      const onBaseBranchChange = vi.fn();
      renderWithProviders(
        <BranchSelector
          {...defaultProps}
          baseBranch="main"
          onBaseBranchChange={onBaseBranchChange}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector-clear")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-clear"));
      });

      expect(onBaseBranchChange).toHaveBeenCalledWith(null);
    });
  });

  describe("Empty State", () => {
    it("shows empty message when no other branches available", async () => {
      // Only the current branch
      mockGitApi.getBranches.mockResolvedValue([
        { name: "feature/new-feature", isRemote: false, isCurrent: true },
      ]);

      renderWithProviders(<BranchSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-trigger"));
      });

      expect(screen.getByText("No other branches available")).toBeDefined();
    });

    it("shows empty message when only remote branches exist (besides current)", async () => {
      // Only remote branches besides current
      mockGitApi.getBranches.mockResolvedValue([
        { name: "feature/new-feature", isRemote: false, isCurrent: true },
        { name: "origin/main", isRemote: true, isCurrent: false },
        { name: "origin/develop", isRemote: true, isCurrent: false },
      ]);

      renderWithProviders(<BranchSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-trigger"));
      });

      // Remote branches are filtered out, so should show empty state
      expect(screen.getByText("No other branches available")).toBeDefined();
    });
  });
});
