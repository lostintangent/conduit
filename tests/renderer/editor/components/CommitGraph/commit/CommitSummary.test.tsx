/**
 * Tests for the CommitSummary component.
 *
 * These tests verify the compact commit display component that
 * shows subject and author on a single line.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommitSummary } from "@/components/panes/editor/components/CommitGraph/commit/CommitSummary";
import type { HistoryCommit } from "@/components/panes/editor/components/CommitGraph/types";
import type { TrackedBranchInfo } from "@features/git/model";
import { trackedBranch } from "../fixtures";

// =============================================================================
// Test Helpers
// =============================================================================

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

function renderWithProvider(ui: React.ReactElement) {
  return render(ui, { wrapper: TestWrapper });
}

function createCommit(overrides: Partial<HistoryCommit> = {}): HistoryCommit {
  return {
    id: "abc123def456abc123def456abc123def456abc1",
    shortId: "abc123d",
    subject: "Fix authentication bug in login flow",
    message: "Fix authentication bug in login flow",
    author: "John Doe",
    authorEmail: "john@example.com",
    timestamp: Date.now() / 1000 - 3600, // 1 hour ago
    parentIds: ["parent123"],
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("CommitSummary", () => {
  describe("Basic Rendering", () => {
    it("should display the subject", () => {
      const commit = createCommit({
        subject: "Add new feature",
      });
      renderWithProvider(<CommitSummary commit={commit} />);

      expect(screen.getByTestId("commit-subject").textContent).toBe(
        "Add new feature",
      );
    });

    it("should display the author", () => {
      const commit = createCommit({
        author: "Jane Smith",
      });
      renderWithProvider(<CommitSummary commit={commit} />);

      expect(screen.getByTestId("commit-meta-author").textContent).toBe(
        "Jane Smith",
      );
    });
  });

  describe("HEAD Commit Styling", () => {
    it("should not have font-medium by default", () => {
      const commit = createCommit();
      renderWithProvider(<CommitSummary commit={commit} />);

      expect(
        screen.getByTestId("commit-subject").classList.contains("font-medium"),
      ).toBe(false);
    });

    it("should have font-medium when isHead is true", () => {
      const commit = createCommit();
      renderWithProvider(<CommitSummary commit={commit} isHead />);

      expect(
        screen.getByTestId("commit-subject").classList.contains("font-medium"),
      ).toBe(true);
    });

    it("should not have font-medium when isHead is false", () => {
      const commit = createCommit();
      renderWithProvider(<CommitSummary commit={commit} isHead={false} />);

      expect(
        screen.getByTestId("commit-subject").classList.contains("font-medium"),
      ).toBe(false);
    });
  });

  describe("View All Button", () => {
    it("should not show view all button when onViewAll is not provided", () => {
      const commit = createCommit();
      renderWithProvider(<CommitSummary commit={commit} />);

      expect(screen.queryByTestId("view-all-button")).toBeNull();
    });

    it("should call onViewAll when button is clicked", () => {
      const commit = createCommit();
      const onViewAll = vi.fn();
      renderWithProvider(
        <CommitSummary commit={commit} onViewAll={onViewAll} />,
      );

      fireEvent.click(screen.getByTestId("view-all-button"));
      expect(onViewAll).toHaveBeenCalledTimes(1);
    });
  });

  describe("Complete Layout", () => {
    it("should show all elements for HEAD commit with onViewAll", () => {
      const commit = createCommit({
        subject: "Important fix",
        author: "Developer",
      });
      const onViewAll = vi.fn();

      renderWithProvider(
        <CommitSummary commit={commit} isHead onViewAll={onViewAll} />,
      );

      // Check all elements are present
      expect(screen.getByTestId("commit-subject").textContent).toBe(
        "Important fix",
      );
      expect(screen.getByTestId("commit-meta-author").textContent).toBe(
        "Developer",
      );
      expect(screen.getByTestId("view-all-button")).toBeTruthy();
      // HEAD styling is font-medium on subject
      expect(
        screen.getByTestId("commit-subject").classList.contains("font-medium"),
      ).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle very long subject", () => {
      const longSubject =
        "This is an extremely long commit subject line that goes on and on and probably should be truncated somewhere";
      const commit = createCommit({
        subject: longSubject,
        message: longSubject,
      });

      renderWithProvider(<CommitSummary commit={commit} />);

      expect(screen.getByTestId("commit-subject").textContent).toBe(
        longSubject,
      );
      expect(screen.getByTestId("commit-subject").getAttribute("title")).toBe(
        longSubject,
      );
    });
  });

  describe("Tracked Branch Badges", () => {
    const headCommitId = "abc123def456abc123def456abc123def456abc1";

    it("should show current branch badge on HEAD commit", () => {
      const commit = createCommit({ id: headCommitId });
      const trackedBranches: TrackedBranchInfo = {
        current: trackedBranch("current", "feature-branch", headCommitId),
        upstream: null,
        base: null,
      };

      renderWithProvider(
        <CommitSummary
          commit={commit}
          isHead
          trackedBranches={trackedBranches}
        />,
      );

      expect(screen.getByTestId("ref-badge-head")).toBeTruthy();
      expect(screen.getByText("feature-branch")).toBeTruthy();
    });

    it("should show upstream badge as icon-only when on same commit as current", () => {
      const commit = createCommit({ id: headCommitId });
      const trackedBranches: TrackedBranchInfo = {
        current: trackedBranch("current", "feature-branch", headCommitId),
        upstream: trackedBranch(
          "upstream",
          "origin/feature-branch",
          headCommitId,
        ),
        base: null,
      };

      renderWithProvider(
        <CommitSummary
          commit={commit}
          isHead
          trackedBranches={trackedBranches}
        />,
      );

      // Current badge should show full text
      const headBadge = screen.getByTestId("ref-badge-head");
      expect(headBadge.textContent).toContain("feature-branch");
      expect(headBadge.dataset.iconOnly).toBeUndefined();

      // Upstream badge should be icon-only
      const remoteBadge = screen.getByTestId("ref-badge-remote");
      expect(remoteBadge.dataset.iconOnly).toBe("true");
    });

    it("should hide base badge when same branch as upstream (VS Code style)", () => {
      const commit = createCommit({ id: headCommitId });
      // On main branch, upstream and base are both origin/main
      const trackedBranches: TrackedBranchInfo = {
        current: trackedBranch("current", "main", headCommitId),
        upstream: trackedBranch("upstream", "origin/main", headCommitId),
        base: trackedBranch("base", "origin/main", headCommitId),
      };

      renderWithProvider(
        <CommitSummary
          commit={commit}
          isHead
          trackedBranches={trackedBranches}
        />,
      );

      // Should have current badge
      expect(screen.getByTestId("ref-badge-head")).toBeTruthy();

      // Should have exactly ONE remote badge (upstream), not two
      // Base is hidden because it's the same branch as upstream
      const remoteBadges = screen.getAllByTestId("ref-badge-remote");
      expect(remoteBadges.length).toBe(1);
    });

    it("should show base badge when different from upstream", () => {
      const commit = createCommit({ id: headCommitId });
      // On feature branch, upstream is origin/feature, base is origin/main
      const trackedBranches: TrackedBranchInfo = {
        current: trackedBranch("current", "feature-branch", headCommitId),
        upstream: trackedBranch(
          "upstream",
          "origin/feature-branch",
          headCommitId,
        ),
        base: trackedBranch("base", "origin/main", headCommitId),
      };

      renderWithProvider(
        <CommitSummary
          commit={commit}
          isHead
          trackedBranches={trackedBranches}
        />,
      );

      // Should have current badge
      expect(screen.getByTestId("ref-badge-head")).toBeTruthy();

      // Should have TWO remote badges (upstream + base, different branches)
      const remoteBadges = screen.getAllByTestId("ref-badge-remote");
      expect(remoteBadges.length).toBe(2);
    });

    it("should show badges on different commits based on commitId", () => {
      const upstreamCommitId = "upstream123456789012345678901234567890";
      const commit = createCommit({ id: upstreamCommitId });

      // This is NOT the HEAD commit, so current badge won't show
      // But upstream points here, so upstream badge should show
      const trackedBranches: TrackedBranchInfo = {
        // Different from this commit
        current: trackedBranch("current", "feature-branch", headCommitId),
        // Same as this commit
        upstream: trackedBranch(
          "upstream",
          "origin/feature-branch",
          upstreamCommitId,
        ),
        base: null,
      };

      renderWithProvider(
        <CommitSummary
          commit={commit}
          isHead={false}
          trackedBranches={trackedBranches}
        />,
      );

      // No current badge (not HEAD)
      expect(screen.queryByTestId("ref-badge-head")).toBeNull();

      // Upstream badge should show with full text (it's the first badge)
      const remoteBadge = screen.getByTestId("ref-badge-remote");
      expect(remoteBadge).toBeTruthy();
      expect(remoteBadge.dataset.iconOnly).toBeUndefined();
    });
  });
});
