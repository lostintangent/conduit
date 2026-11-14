/**
 * Tests for BranchSwitcher component.
 *
 * Tests the branch switching dropdown that allows users to checkout
 * different branches with conflict handling.
 */

import type { GitBranch } from "@/api/GitV2API";
import type { GitV2API } from "@/api/GitV2API";
import { BranchSwitcher } from "@/components/panes/editor/components/FileTreePanel/BranchSwitcher";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../../queryRender";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  },
  {
    name: "develop",
    isCurrent: false,
    isRemote: false,
    commit: "def456",
    lastCommitDate: new Date("2025-01-16"), // More recent
  },
  {
    name: "feature/old-branch",
    isCurrent: false,
    isRemote: false,
    commit: "ghi789",
    lastCommitDate: new Date("2025-01-10"), // Older
  },
  {
    name: "origin/main",
    isCurrent: false,
    isRemote: true,
    commit: "abc123",
    lastCommitDate: new Date("2025-01-15"),
  },
];

// ============================================================================
// Mock Git API
// ============================================================================

function createMockGitAPI(overrides: Partial<GitV2API> = {}): GitV2API {
  return {
    whenReady: vi.fn().mockResolvedValue(undefined),
    getBranches: vi.fn().mockResolvedValue(mockBranches),
    checkout: vi.fn().mockResolvedValue(undefined),
    createBranch: vi.fn().mockResolvedValue(undefined),
    stash: vi.fn().mockResolvedValue(undefined),
    stashPop: vi.fn().mockResolvedValue(undefined),
    // Add other required methods as no-ops
    getCurrentBranch: vi.fn().mockResolvedValue("main"),
    getStatus: vi.fn().mockResolvedValue(new Map()),
    getStatusFromBranch: vi.fn().mockResolvedValue(new Map()),
    stage: vi.fn().mockResolvedValue(undefined),
    unstage: vi.fn().mockResolvedValue(undefined),
    revert: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    pull: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue(undefined),
    getUpstreamStatus: vi.fn().mockResolvedValue({ ahead: 0, behind: 0 }),
    onStatusChanged: vi.fn().mockReturnValue(() => {}),
    onBranchChanged: vi.fn().mockReturnValue(() => {}),
    onCommitCreated: vi.fn().mockReturnValue(() => {}),
    dispose: vi.fn(),
    ...overrides,
  } as unknown as GitV2API;
}

// ============================================================================
// Tests
// ============================================================================

describe("BranchSwitcher", () => {
  const mockOnBranchSwitch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("should render current branch name", () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSwitcher
          git={mockGit}
          currentBranch="main"
          onBranchSwitch={mockOnBranchSwitch}
        />,
      );

      expect(screen.getByText("main")).toBeDefined();
    });

    it("should render nothing when currentBranch is null", () => {
      const mockGit = createMockGitAPI();

      const { container } = render(
        <BranchSwitcher
          git={mockGit}
          currentBranch={null}
          onBranchSwitch={mockOnBranchSwitch}
        />,
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe("dropdown behavior", () => {
    it("should load branches when dropdown opens", async () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSwitcher
          git={mockGit}
          currentBranch="main"
          onBranchSwitch={mockOnBranchSwitch}
        />,
      );

      // Click to open dropdown - use pointerDown for Radix components
      const trigger = screen.getByTestId("branch-switcher-trigger");
      await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
      });

      await waitFor(() => {
        expect(mockGit.whenReady).toHaveBeenCalled();
        expect(mockGit.getBranches).toHaveBeenCalled();
      });
    });

    it("should show loading state while fetching branches", async () => {
      // Use fake timers to control async timing
      vi.useFakeTimers();

      const mockGit = createMockGitAPI({
        getBranches: vi
          .fn()
          .mockImplementation(
            () =>
              new Promise((resolve) =>
                setTimeout(() => resolve(mockBranches), 100),
              ),
          ),
      });

      render(
        <BranchSwitcher
          git={mockGit}
          currentBranch="main"
          onBranchSwitch={mockOnBranchSwitch}
        />,
      );

      const trigger = screen.getByTestId("branch-switcher-trigger");

      // Open dropdown without advancing timers
      await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
        // Let microtasks (like whenReady) settle, but not setTimeout
        await Promise.resolve();
      });

      // Should show loading state while getBranches is pending
      expect(screen.getByText("Loading branches...")).toBeDefined();

      // Cleanup: advance timers and restore
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      vi.useRealTimers();
    });

    it("should filter out remote branches", async () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSwitcher
          git={mockGit}
          currentBranch="main"
          onBranchSwitch={mockOnBranchSwitch}
        />,
      );

      const trigger = screen.getByTestId("branch-switcher-trigger");
      await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
      });

      await waitFor(() => {
        // Local branches should be visible
        expect(screen.getByText("develop")).toBeDefined();
        expect(screen.getByText("feature/old-branch")).toBeDefined();
      });

      // Remote branches should NOT be visible
      expect(screen.queryByText("origin/main")).toBeNull();
    });

    it("should sort branches by last commit date (most recent first), current branch first", async () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSwitcher
          git={mockGit}
          currentBranch="main"
          onBranchSwitch={mockOnBranchSwitch}
        />,
      );

      const trigger = screen.getByTestId("branch-switcher-trigger");
      await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
      });

      await waitFor(() => {
        const branchItems = screen.getAllByTestId(/^branch-option-/);
        // Current branch (main) first, then develop (most recent), then feature/old-branch (oldest)
        expect(branchItems[0].textContent).toContain("main");
        expect(branchItems[1].textContent).toContain("develop");
        expect(branchItems[2].textContent).toContain("feature/old-branch");
      });
    });
  });

  describe("branch selection", () => {
    it("should checkout branch and call onBranchSwitch on success", async () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSwitcher
          git={mockGit}
          currentBranch="main"
          onBranchSwitch={mockOnBranchSwitch}
        />,
      );

      const trigger = screen.getByTestId("branch-switcher-trigger");
      await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
      });

      await waitFor(() => {
        expect(screen.getByText("develop")).toBeDefined();
      });

      const developOption = screen.getByTestId("branch-option-develop");
      await act(async () => {
        fireEvent.click(developOption);
      });

      await waitFor(() => {
        expect(mockGit.checkout).toHaveBeenCalledWith("develop");
        expect(mockOnBranchSwitch).toHaveBeenCalledWith("develop");
      });
    });

    it("should not allow selecting current branch", async () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSwitcher
          git={mockGit}
          currentBranch="main"
          onBranchSwitch={mockOnBranchSwitch}
        />,
      );

      const trigger = screen.getByTestId("branch-switcher-trigger");
      await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
      });

      await waitFor(() => {
        expect(screen.getByTestId("branch-option-main")).toBeDefined();
      });

      const mainOption = screen.getByTestId("branch-option-main");
      // Radix uses data-disabled="" for disabled items (attribute presence, not value)
      expect(mainOption.hasAttribute("data-disabled")).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should show error message when branch loading fails", async () => {
      const mockGit = createMockGitAPI({
        getBranches: vi.fn().mockRejectedValue(new Error("Network error")),
      });

      render(
        <BranchSwitcher
          git={mockGit}
          currentBranch="main"
          onBranchSwitch={mockOnBranchSwitch}
        />,
      );

      const trigger = screen.getByTestId("branch-switcher-trigger");
      await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
      });

      await waitFor(() => {
        expect(screen.getByText("Failed to load branches")).toBeDefined();
      });
    });
  });

  describe("create branch", () => {
    it("should show create branch option", async () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSwitcher
          git={mockGit}
          currentBranch="main"
          onBranchSwitch={mockOnBranchSwitch}
        />,
      );

      const trigger = screen.getByTestId("branch-switcher-trigger");
      await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
      });

      await waitFor(() => {
        expect(screen.getByTestId("create-branch-option")).toBeDefined();
      });

      expect(screen.getByText("Create new branch...")).toBeDefined();
    });

    it("should show input when create branch option is clicked", async () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSwitcher
          git={mockGit}
          currentBranch="main"
          onBranchSwitch={mockOnBranchSwitch}
        />,
      );

      const trigger = screen.getByTestId("branch-switcher-trigger");
      await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
      });

      await waitFor(() => {
        expect(screen.getByTestId("create-branch-option")).toBeDefined();
      });

      const createOption = screen.getByTestId("create-branch-option");
      await act(async () => {
        fireEvent.click(createOption);
      });

      await waitFor(() => {
        expect(screen.getByTestId("create-branch-input")).toBeDefined();
      });
    });

    it("should create branch and switch when enter is pressed", async () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSwitcher
          git={mockGit}
          currentBranch="main"
          onBranchSwitch={mockOnBranchSwitch}
        />,
      );

      const trigger = screen.getByTestId("branch-switcher-trigger");
      await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
      });

      await waitFor(() => {
        expect(screen.getByTestId("create-branch-option")).toBeDefined();
      });

      const createOption = screen.getByTestId("create-branch-option");
      await act(async () => {
        fireEvent.click(createOption);
      });

      const input = await screen.findByTestId("create-branch-input");
      await act(async () => {
        fireEvent.change(input, { target: { value: "feature/new-feature" } });
        fireEvent.keyDown(input, { key: "Enter" });
      });

      await waitFor(() => {
        expect(mockGit.createBranch).toHaveBeenCalledWith(
          "feature/new-feature",
        );
        expect(mockOnBranchSwitch).toHaveBeenCalledWith("feature/new-feature");
      });
    });

    it("should cancel create branch when escape is pressed", async () => {
      const mockGit = createMockGitAPI();

      render(
        <BranchSwitcher
          git={mockGit}
          currentBranch="main"
          onBranchSwitch={mockOnBranchSwitch}
        />,
      );

      const trigger = screen.getByTestId("branch-switcher-trigger");
      await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
      });

      await waitFor(() => {
        expect(screen.getByTestId("create-branch-option")).toBeDefined();
      });

      const createOption = screen.getByTestId("create-branch-option");
      await act(async () => {
        fireEvent.click(createOption);
      });

      const input = await screen.findByTestId("create-branch-input");
      await act(async () => {
        fireEvent.change(input, { target: { value: "test-branch" } });
        fireEvent.keyDown(input, { key: "Escape" });
      });

      // Should go back to showing the create option
      await waitFor(() => {
        expect(screen.getByTestId("create-branch-option")).toBeDefined();
      });

      expect(mockGit.createBranch).not.toHaveBeenCalled();
    });

    it("should show error when branch creation fails", async () => {
      const mockGit = createMockGitAPI({
        createBranch: vi
          .fn()
          .mockRejectedValue(new Error("Branch already exists")),
      });

      render(
        <BranchSwitcher
          git={mockGit}
          currentBranch="main"
          onBranchSwitch={mockOnBranchSwitch}
        />,
      );

      const trigger = screen.getByTestId("branch-switcher-trigger");
      await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
      });

      await waitFor(() => {
        expect(screen.getByTestId("create-branch-option")).toBeDefined();
      });

      const createOption = screen.getByTestId("create-branch-option");
      await act(async () => {
        fireEvent.click(createOption);
      });

      const input = await screen.findByTestId("create-branch-input");
      await act(async () => {
        fireEvent.change(input, { target: { value: "main" } });
        fireEvent.keyDown(input, { key: "Enter" });
      });

      await waitFor(() => {
        expect(screen.getByText("Branch already exists")).toBeDefined();
      });
    });
  });
});
