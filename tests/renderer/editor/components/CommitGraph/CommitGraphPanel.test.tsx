/**
 * Tests for the CommitGraphPanel component.
 *
 * These tests verify the main container component for the commit graph feature.
 * The useCommitGraph hook is tested separately in hooks/useCommitGraph.test.ts
 * which covers all state management, loading, error handling, and pagination.
 *
 * These tests focus on verifying the component structure and basic rendering.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { GitV2API } from "@/api/GitV2API";
import { CommitGraphPanel } from "@/components/panes/editor/components/CommitGraph/CommitGraphPanel";

// =============================================================================
// Test Helpers
// =============================================================================

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

function renderWithProvider(ui: React.ReactElement) {
  return render(ui, { wrapper: TestWrapper });
}

function createMockGitApi(): GitV2API {
  return {
    getCommitHistory: vi
      .fn()
      .mockResolvedValue({ commits: [], hasMore: false }),
    getCommitFiles: vi.fn().mockResolvedValue([]),
    getStatus: vi.fn(),
    getBranches: vi.fn(),
    checkout: vi.fn(),
    createBranch: vi.fn(),
    deleteBranch: vi.fn(),
    getRemotes: vi.fn(),
    fetch: vi.fn(),
    pull: vi.fn(),
    push: vi.fn(),
    stage: vi.fn(),
    unstage: vi.fn(),
    commit: vi.fn(),
    getFileContent: vi.fn(),
    getFileDiff: vi.fn(),
    discardChanges: vi.fn(),
    stash: vi.fn(),
    stashPop: vi.fn(),
    stashList: vi.fn(),
    getConfig: vi.fn(),
    setConfig: vi.fn(),
    getTrackedBranches: vi.fn().mockResolvedValue({
      current: null,
      upstream: null,
      base: null,
    }),
    onStatusChanged: vi.fn().mockReturnValue(() => {}),
    onHeadChanged: vi.fn().mockReturnValue(() => {}),
    onBranchChanged: vi.fn().mockReturnValue(() => {}),
    cwd: "/test/cwd",
  } as unknown as GitV2API;
}

// =============================================================================
// Tests
// =============================================================================

describe("CommitGraphPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("rendering", () => {
    it("should render with data-testid", async () => {
      const git = createMockGitApi();

      await act(async () => {
        renderWithProvider(<CommitGraphPanel git={git} />);
      });

      expect(screen.getByTestId("commit-graph-panel")).toBeTruthy();
    });

    it("should render header with title", async () => {
      const git = createMockGitApi();

      await act(async () => {
        renderWithProvider(<CommitGraphPanel git={git} />);
      });

      expect(screen.getByTestId("commit-graph-header")).toBeTruthy();
      expect(screen.getByText("Commits")).toBeTruthy();
    });

    it("should render refresh button", async () => {
      const git = createMockGitApi();

      await act(async () => {
        renderWithProvider(<CommitGraphPanel git={git} />);
      });

      expect(screen.getByTestId("refresh-button")).toBeTruthy();
    });

    it("should apply custom className", async () => {
      const git = createMockGitApi();

      await act(async () => {
        renderWithProvider(
          <CommitGraphPanel git={git} className="custom-class" />,
        );
      });

      expect(
        screen
          .getByTestId("commit-graph-panel")
          .classList.contains("custom-class"),
      ).toBe(true);
    });
  });

  describe("empty state", () => {
    it("should show empty state when no commits", async () => {
      const git = createMockGitApi();

      await act(async () => {
        renderWithProvider(<CommitGraphPanel git={git} />);
      });

      // Default mock state has empty nodes, should show empty state
      expect(screen.getByTestId("commit-graph-empty")).toBeTruthy();
      expect(screen.getByText("No commits yet")).toBeTruthy();
    });
  });

  describe("auto-refresh", () => {
    it("should subscribe to onHeadChanged for commit/pull detection", async () => {
      const git = createMockGitApi();

      await act(async () => {
        renderWithProvider(<CommitGraphPanel git={git} />);
      });

      expect(git.onHeadChanged).toHaveBeenCalled();
    });

    it("should subscribe to onBranchChanged for branch switch detection", async () => {
      const git = createMockGitApi();

      await act(async () => {
        renderWithProvider(<CommitGraphPanel git={git} />);
      });

      expect(git.onBranchChanged).toHaveBeenCalled();
    });

    it("should subscribe to onStatusChanged for push/upstream detection", async () => {
      const git = createMockGitApi();

      await act(async () => {
        renderWithProvider(<CommitGraphPanel git={git} />);
      });

      expect(git.onStatusChanged).toHaveBeenCalled();
    });

    it("should cleanup all subscriptions on unmount", async () => {
      const git = createMockGitApi();
      const headCleanup = vi.fn();
      const branchCleanup = vi.fn();
      const statusCleanup = vi.fn();
      (git.onHeadChanged as ReturnType<typeof vi.fn>).mockReturnValue(
        headCleanup,
      );
      (git.onBranchChanged as ReturnType<typeof vi.fn>).mockReturnValue(
        branchCleanup,
      );
      (git.onStatusChanged as ReturnType<typeof vi.fn>).mockReturnValue(
        statusCleanup,
      );

      const { unmount } = await act(async () => {
        return renderWithProvider(<CommitGraphPanel git={git} />);
      });

      unmount();

      expect(headCleanup).toHaveBeenCalled();
      expect(branchCleanup).toHaveBeenCalled();
      expect(statusCleanup).toHaveBeenCalled();
    });
  });
});
