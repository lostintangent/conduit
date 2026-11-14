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
import { screen, act, fireEvent, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { render } from "../../../queryRender";
import type { GitV2API } from "@/api/GitV2API";
import { CommitGraphPanel } from "@/components/panes/editor/components/CommitGraph/CommitGraphPanel";

// =============================================================================
// Test Helpers
// =============================================================================

function renderWithProvider(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

function createMockGitApi(): GitV2API {
  return {
    whenReady: vi.fn().mockResolvedValue(undefined),
    getCommitHistory: vi
      .fn()
      .mockResolvedValue({ commits: [], hasMore: false }),
    getCommitFiles: vi.fn().mockResolvedValue([]),
    getStatus: vi.fn(),
    getBranches: vi.fn(),
    deleteBranch: vi.fn(),
    getRemotes: vi.fn(),
    fetch: vi.fn(),
    getFileContent: vi.fn(),
    getFileDiff: vi.fn(),
    discardChanges: vi.fn(),
    stashList: vi.fn(),
    getConfig: vi.fn(),
    setConfig: vi.fn(),
    getTrackedBranches: vi.fn().mockResolvedValue({
      current: null,
      upstream: null,
      base: null,
    }),
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
    it("should render header with title", async () => {
      const git = createMockGitApi();

      await act(async () => {
        renderWithProvider(<CommitGraphPanel git={git} />);
      });

      expect(screen.getByTestId("commit-graph-header")).toBeTruthy();
      expect(screen.getByText("Commits")).toBeTruthy();
    });
  });

  describe("empty state", () => {
    it("should show empty state when no commits", async () => {
      const git = createMockGitApi();

      await act(async () => {
        renderWithProvider(<CommitGraphPanel git={git} />);
      });

      expect(await screen.findByTestId("commit-graph-empty")).toBeTruthy();
      expect(screen.getByText("No commits yet")).toBeTruthy();
    });
  });

  describe("load more", () => {
    it("is busy while the history refreshes, since a click then would be ignored", async () => {
      const git = createMockGitApi();
      const page = {
        commits: [
          {
            id: "abc1234",
            shortId: "abc1234",
            subject: "First",
            message: "First",
            author: "Test Author",
            authorEmail: "test@example.com",
            timestamp: 1_700_000_000_000,
            parentIds: [] as string[],
          },
        ],
        hasMore: true,
      };
      let finishRefresh!: (value: typeof page) => void;
      vi.mocked(git.getCommitHistory)
        .mockResolvedValueOnce(page)
        .mockReturnValueOnce(
          new Promise((resolve) => {
            finishRefresh = resolve;
          }),
        );

      renderWithProvider(<CommitGraphPanel git={git} />);
      const loadMore = await screen.findByTestId("load-more-button");
      expect(loadMore.hasAttribute("disabled")).toBe(false);

      fireEvent.click(screen.getByTestId("refresh-button"));
      await waitFor(() =>
        expect(
          screen.getByTestId("load-more-button").hasAttribute("disabled"),
        ).toBe(true),
      );

      await act(async () => finishRefresh(page));
      await waitFor(() =>
        expect(
          screen.getByTestId("load-more-button").hasAttribute("disabled"),
        ).toBe(false),
      );
    });
  });
});
