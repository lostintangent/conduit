/**
 * Tests for BranchSelector component.
 *
 * Tests the dialog that allows selecting a base branch for comparison mode.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { mockGitReads } from "../../../git";
import { render } from "../../../queryRender";
import { BranchSelector } from "@/components/panes/editor/components/FileTreePanel/BranchSelector";
import type { GitSubscription } from "@features/git/client/GitSubscription";
import type { GitBranch } from "@features/git/model";

// ============================================================================
// Test Data
// ============================================================================

const mockBranches: GitBranch[] = [
  {
    name: "main",
    isCurrent: true,
    isRemote: false,
    commit: "abc123",
    lastCommitDate: new Date("2025-01-15"),
    lastCommitMessage: "Initial commit",
  },
  {
    name: "develop",
    isCurrent: false,
    isRemote: false,
    commit: "def456",
    lastCommitDate: new Date("2025-01-16"),
    lastCommitMessage: "Add feature X",
  },
  {
    name: "feature/old-branch",
    isCurrent: false,
    isRemote: false,
    commit: "ghi789",
    lastCommitDate: new Date("2025-01-10"),
    lastCommitMessage: "Work in progress",
  },
];

// ============================================================================
// Mock Git API
// ============================================================================

function createMockGitAPI(): GitSubscription {
  return {
    cwd: "/project",
    whenReady: vi.fn().mockResolvedValue(undefined),
  } as unknown as GitSubscription;
}

// ============================================================================
// Tests
// ============================================================================

describe("BranchSelector", () => {
  const mockOnSelectBranch = vi.fn();
  const mockOnOpenChange = vi.fn();
  let reads: ReturnType<typeof mockGitReads>;

  beforeEach(() => {
    vi.clearAllMocks();
    reads = mockGitReads();
    reads.getBranches.mockResolvedValue(mockBranches);
  });

  describe("rendering", () => {
    it("should not render when closed", () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSelector
          git={mockGit}
          open={false}
          currentBaseBranch={null}
          onSelectBranch={mockOnSelectBranch}
          onOpenChange={mockOnOpenChange}
        />,
      );

      expect(screen.queryByText("Select Base Branch")).toBeNull();
    });

    it("should render dialog when open", async () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSelector
          git={mockGit}
          open={true}
          currentBaseBranch={null}
          onSelectBranch={mockOnSelectBranch}
          onOpenChange={mockOnOpenChange}
        />,
      );

      expect(screen.getByText("Select Base Branch")).toBeDefined();
      expect(screen.getByTestId("branch-selector-filter")).toBeDefined();
    });

    it("should show HEAD option after loading", async () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSelector
          git={mockGit}
          open={true}
          currentBaseBranch={null}
          onSelectBranch={mockOnSelectBranch}
          onOpenChange={mockOnOpenChange}
        />,
      );

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByTestId("branch-selector-head")).toBeDefined();
      });
      expect(screen.getByText("HEAD")).toBeDefined();
    });

    it("should show branches after loading", async () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSelector
          git={mockGit}
          open={true}
          currentBaseBranch={null}
          onSelectBranch={mockOnSelectBranch}
          onOpenChange={mockOnOpenChange}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("main")).toBeDefined();
        expect(screen.getByText("develop")).toBeDefined();
      });
    });

    it("should show 'comparing' badge for current base branch", async () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSelector
          git={mockGit}
          open={true}
          currentBaseBranch="develop"
          onSelectBranch={mockOnSelectBranch}
          onOpenChange={mockOnOpenChange}
        />,
      );

      await waitFor(() => {
        const comparingBadges = screen.getAllByText("comparing");
        expect(comparingBadges.length).toBeGreaterThan(0);
      });
    });

    it("should show 'current' badge for current branch", async () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSelector
          git={mockGit}
          open={true}
          currentBaseBranch={null}
          onSelectBranch={mockOnSelectBranch}
          onOpenChange={mockOnOpenChange}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("current")).toBeDefined();
      });
    });
  });

  describe("selection", () => {
    it("should call onSelectBranch with null when HEAD is clicked", async () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSelector
          git={mockGit}
          open={true}
          currentBaseBranch="develop"
          onSelectBranch={mockOnSelectBranch}
          onOpenChange={mockOnOpenChange}
        />,
      );

      // Wait for branches to load first
      await waitFor(() => {
        expect(screen.getByTestId("branch-selector-head")).toBeDefined();
      });

      const headOption = screen.getByTestId("branch-selector-head");
      fireEvent.click(headOption);

      expect(mockOnSelectBranch).toHaveBeenCalledWith(null);
    });

    it("should call onSelectBranch with branch name when branch is clicked", async () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSelector
          git={mockGit}
          open={true}
          currentBaseBranch={null}
          onSelectBranch={mockOnSelectBranch}
          onOpenChange={mockOnOpenChange}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByTestId("branch-selector-option-develop"),
        ).toBeDefined();
      });

      const developOption = screen.getByTestId(
        "branch-selector-option-develop",
      );
      fireEvent.click(developOption);

      expect(mockOnSelectBranch).toHaveBeenCalledWith("develop");
    });
  });

  describe("filtering", () => {
    it("should filter branches by search query", async () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSelector
          git={mockGit}
          open={true}
          currentBaseBranch={null}
          onSelectBranch={mockOnSelectBranch}
          onOpenChange={mockOnOpenChange}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("develop")).toBeDefined();
      });

      const filterInput = screen.getByTestId("branch-selector-filter");
      fireEvent.change(filterInput, { target: { value: "feat" } });

      await waitFor(() => {
        expect(screen.getByText("feature/old-branch")).toBeDefined();
        expect(screen.queryByText("develop")).toBeNull();
      });
    });

    it("should show 'no branches found' when filter matches nothing", async () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSelector
          git={mockGit}
          open={true}
          currentBaseBranch={null}
          onSelectBranch={mockOnSelectBranch}
          onOpenChange={mockOnOpenChange}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("develop")).toBeDefined();
      });

      const filterInput = screen.getByTestId("branch-selector-filter");
      fireEvent.change(filterInput, { target: { value: "nonexistent" } });

      await waitFor(() => {
        expect(screen.getByText(/No branches found matching/)).toBeDefined();
      });
    });
  });

  describe("error handling", () => {
    it("should show error when branch loading fails", async () => {
      const mockGit = createMockGitAPI();
      reads.getBranches.mockRejectedValue(new Error("Network error"));

      render(
        <BranchSelector
          git={mockGit}
          open={true}
          currentBaseBranch={null}
          onSelectBranch={mockOnSelectBranch}
          onOpenChange={mockOnOpenChange}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Failed to load branches")).toBeDefined();
      });
    });
  });
});
