/**
 * Tests for BranchSelector component.
 *
 * Tests the branch selection dialog that allows users to select
 * a base branch for comparison mode.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BranchSelector } from "@/components/panes/editor/BranchSelector";
import type { Branch } from "@shared/types";

// Mock scrollIntoView which isn't available in JSDOM
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// ============================================================================
// Test Data
// ============================================================================

const mockBranches: Branch[] = [
  {
    name: "main",
    isCurrent: false,
    isRemote: false,
    lastCommitDate: new Date("2025-01-15"),
    lastCommitMessage: "Latest commit on main",
  },
  {
    name: "develop",
    isCurrent: false,
    isRemote: false,
    lastCommitDate: new Date("2025-01-14"),
    lastCommitMessage: "Development branch",
  },
  {
    name: "feature/new-feature",
    isCurrent: true,
    isRemote: false,
    lastCommitDate: new Date("2025-01-16"),
    lastCommitMessage: "Working on feature",
  },
  {
    name: "origin/main",
    isCurrent: false,
    isRemote: true,
    lastCommitDate: new Date("2025-01-15"),
    lastCommitMessage: "Latest commit on main",
  },
  {
    name: "origin/develop",
    isCurrent: false,
    isRemote: true,
    lastCommitDate: new Date("2025-01-14"),
    lastCommitMessage: "Development branch",
  },
];

// ============================================================================
// Tests
// ============================================================================

describe("BranchSelector", () => {
  const mockOnSelectBranch = vi.fn();
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("branch filtering", () => {
    it("should filter out remote branches", async () => {
      render(
        <BranchSelector
          open={true}
          branches={mockBranches}
          currentBaseBranch={null}
          onSelectBranch={mockOnSelectBranch}
          onOpenChange={mockOnOpenChange}
        />,
      );

      // Local branches should be visible
      expect(screen.getByText("main")).toBeDefined();
      expect(screen.getByText("develop")).toBeDefined();

      // Remote branches should NOT be visible
      expect(screen.queryByText("origin/main")).toBeNull();
      expect(screen.queryByText("origin/develop")).toBeNull();
    });

    it("should show local branches with slashes in name", async () => {
      render(
        <BranchSelector
          open={true}
          branches={mockBranches}
          currentBaseBranch={null}
          onSelectBranch={mockOnSelectBranch}
          onOpenChange={mockOnOpenChange}
        />,
      );

      // Local branch with slash should be visible (but marked as current)
      // The feature/new-feature branch is marked as current, so it should show with "current" badge
      expect(screen.getByText("feature/new-feature")).toBeDefined();
    });

    it("should filter branches by search term", async () => {
      render(
        <BranchSelector
          open={true}
          branches={mockBranches}
          currentBaseBranch={null}
          onSelectBranch={mockOnSelectBranch}
          onOpenChange={mockOnOpenChange}
        />,
      );

      const filterInput = screen.getByPlaceholderText("Filter branches...");
      fireEvent.change(filterInput, { target: { value: "dev" } });

      // Should show develop but not main
      expect(screen.getByText("develop")).toBeDefined();
      expect(screen.queryByText(/^main$/)).toBeNull();

      // Remote branches still should not appear even if they match
      expect(screen.queryByText("origin/develop")).toBeNull();
    });
  });

  describe("branch selection", () => {
    it("should call onSelectBranch when a branch is clicked", async () => {
      render(
        <BranchSelector
          open={true}
          branches={mockBranches}
          currentBaseBranch={null}
          onSelectBranch={mockOnSelectBranch}
          onOpenChange={mockOnOpenChange}
        />,
      );

      const mainBranch = screen.getByText("main");
      fireEvent.click(mainBranch);

      expect(mockOnSelectBranch).toHaveBeenCalledWith("main");
    });

    it("should call onSelectBranch with null when HEAD is selected", async () => {
      render(
        <BranchSelector
          open={true}
          branches={mockBranches}
          currentBaseBranch="main"
          onSelectBranch={mockOnSelectBranch}
          onOpenChange={mockOnOpenChange}
        />,
      );

      const headOption = screen.getByText("HEAD");
      fireEvent.click(headOption);

      expect(mockOnSelectBranch).toHaveBeenCalledWith(null);
    });
  });

  describe("empty state", () => {
    it("should show message when no branches match filter", async () => {
      render(
        <BranchSelector
          open={true}
          branches={mockBranches}
          currentBaseBranch={null}
          onSelectBranch={mockOnSelectBranch}
          onOpenChange={mockOnOpenChange}
        />,
      );

      const filterInput = screen.getByPlaceholderText("Filter branches...");
      fireEvent.change(filterInput, { target: { value: "nonexistent" } });

      expect(
        screen.getByText('No branches found matching "nonexistent"'),
      ).toBeDefined();
    });
  });
});
