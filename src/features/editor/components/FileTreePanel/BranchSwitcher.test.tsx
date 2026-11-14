/**
 * Tests for BranchSwitcher component.
 *
 * Tests the branch switching dropdown that allows users to checkout
 * different branches with conflict handling.
 */

import type { GitBranch } from "@features/git/model";
import type { GitSubscription } from "@features/git/client/GitSubscription";
import { BranchSwitcher } from "@features/editor/components/FileTreePanel/BranchSwitcher";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { mockGitReads, mockGitWrites } from "../../../../../tests/renderer/git";
import { render } from "../../../../../tests/renderer/queryRender";
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
// Tests
// ============================================================================

const CWD = "/repo";
const whenReady = vi.fn(async () => {});
const git = { cwd: CWD, whenReady } as unknown as GitSubscription;

describe("BranchSwitcher", () => {
  const mockOnBranchSwitch = vi.fn();
  let reads: ReturnType<typeof mockGitReads>;
  let writes: ReturnType<typeof mockGitWrites>;

  beforeEach(() => {
    vi.clearAllMocks();
    reads = mockGitReads();
    reads.getBranches.mockResolvedValue(mockBranches);
    writes = mockGitWrites();
  });

  function renderSwitcher(currentBranch: string | null = "main") {
    return render(
      <BranchSwitcher
        git={git}
        currentBranch={currentBranch}
        onBranchSwitch={mockOnBranchSwitch}
      />,
    );
  }

  /** Open the dropdown, which Radix does on pointerdown rather than click. */
  async function openDropdown() {
    await act(async () => {
      fireEvent.pointerDown(screen.getByTestId("branch-switcher-trigger"), {
        button: 0,
        pointerType: "mouse",
      });
    });
  }

  async function selectBranch(name: string) {
    await act(async () => {
      fireEvent.click(await screen.findByTestId(`branch-option-${name}`));
    });
  }

  /** Open the dropdown's create-branch input. */
  async function openCreateInput() {
    await openDropdown();
    await act(async () => {
      fireEvent.click(await screen.findByTestId("create-branch-option"));
    });
    return screen.findByTestId("create-branch-input");
  }

  async function typeBranchName(input: HTMLElement, name: string, key: string) {
    await act(async () => {
      fireEvent.change(input, { target: { value: name } });
      fireEvent.keyDown(input, { key });
    });
  }

  describe("rendering", () => {
    it("should render current branch name", () => {
      renderSwitcher();

      expect(screen.getByText("main")).toBeDefined();
    });

    it("should render nothing when currentBranch is null", () => {
      const { container } = renderSwitcher(null);

      expect(container.firstChild).toBeNull();
    });
  });

  describe("dropdown behavior", () => {
    it("should load branches when dropdown opens", async () => {
      renderSwitcher();
      await act(async () => {});
      expect(reads.getBranches).not.toHaveBeenCalled();

      await openDropdown();

      await waitFor(() => {
        expect(whenReady).toHaveBeenCalled();
        expect(reads.getBranches).toHaveBeenCalledWith(CWD);
      });
    });

    it("should show loading state while fetching branches", async () => {
      // Use fake timers to control async timing
      vi.useFakeTimers();
      reads.getBranches.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockBranches), 100),
          ),
      );
      renderSwitcher();

      await openDropdown();

      // Should show loading state while getBranches is pending
      expect(screen.getByText("Loading branches...")).toBeDefined();

      // Cleanup: advance timers and restore
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      vi.useRealTimers();
    });

    it("should filter out remote branches", async () => {
      renderSwitcher();
      await openDropdown();

      await waitFor(() => {
        // Local branches should be visible
        expect(screen.getByText("develop")).toBeDefined();
        expect(screen.getByText("feature/old-branch")).toBeDefined();
      });

      // Remote branches should NOT be visible
      expect(screen.queryByText("origin/main")).toBeNull();
    });

    it("should sort branches by last commit date (most recent first), current branch first", async () => {
      renderSwitcher();
      await openDropdown();

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
      renderSwitcher();
      await openDropdown();

      await selectBranch("develop");

      await waitFor(() => {
        expect(writes.checkout).toHaveBeenCalledWith(CWD, "develop", false);
        expect(mockOnBranchSwitch).toHaveBeenCalledWith("develop");
      });
    });

    it("should not allow selecting current branch", async () => {
      renderSwitcher();
      await openDropdown();

      const mainOption = await screen.findByTestId("branch-option-main");
      expect(mainOption.getAttribute("aria-disabled")).toBe("true");

      fireEvent.click(mainOption);
      expect(writes.checkout).not.toHaveBeenCalled();
      expect(mockOnBranchSwitch).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should show error message when branch loading fails", async () => {
      reads.getBranches.mockRejectedValue(new Error("Network error"));
      renderSwitcher();

      await openDropdown();

      expect(await screen.findByText("Failed to load branches")).toBeDefined();
    });

    it.each([
      ["checkout-conflict-stash", "stash"],
      ["checkout-conflict-force", "checkout"],
    ] as const)(
      "should re-enable the conflict dialog when %s fails",
      async (buttonId, failingMethod) => {
        let fail!: (error: Error) => void;
        const hanging = new Promise((_, reject) => (fail = reject));
        writes.checkout.mockRejectedValueOnce(
          new Error("Your local changes would be overwritten"),
        );
        writes[failingMethod].mockReturnValueOnce(hanging);
        renderSwitcher();

        await openDropdown();
        await selectBranch("develop");

        const button = () => screen.getByTestId<HTMLButtonElement>(buttonId);
        await waitFor(() => expect(button().disabled).toBe(false));

        await act(async () => {
          fireEvent.click(button());
        });
        await waitFor(() => expect(button().disabled).toBe(true));

        await act(async () => fail(new Error("boom")));

        await waitFor(() => expect(button().disabled).toBe(false));
        expect(mockOnBranchSwitch).not.toHaveBeenCalled();
      },
    );
  });

  describe("create branch", () => {
    it("should show create branch option", async () => {
      renderSwitcher();
      await openDropdown();

      expect(await screen.findByTestId("create-branch-option")).toBeDefined();
      expect(screen.getByText("Create new branch...")).toBeDefined();
    });

    it("should create branch and switch when enter is pressed", async () => {
      renderSwitcher();
      const input = await openCreateInput();
      await waitFor(() => expect(document.activeElement).toBe(input));

      await typeBranchName(input, "feature/new-feature", "Enter");

      await waitFor(() => {
        expect(writes.createBranch).toHaveBeenCalledWith(
          CWD,
          "feature/new-feature",
        );
        expect(mockOnBranchSwitch).toHaveBeenCalledWith("feature/new-feature");
      });
    });

    it("should cancel create branch when escape is pressed", async () => {
      renderSwitcher();
      const input = await openCreateInput();

      await typeBranchName(input, "test-branch", "Escape");

      // Should go back to showing the create option
      expect(await screen.findByTestId("create-branch-option")).toBeDefined();
      expect(writes.createBranch).not.toHaveBeenCalled();
    });

    it("should show error when branch creation fails", async () => {
      writes.createBranch.mockRejectedValue(new Error("Branch already exists"));
      renderSwitcher();
      const input = await openCreateInput();

      await typeBranchName(input, "main", "Enter");

      expect(await screen.findByText("Branch already exists")).toBeDefined();
    });
  });
});
