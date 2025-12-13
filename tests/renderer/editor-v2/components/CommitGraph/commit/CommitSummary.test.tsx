/**
 * Tests for the CommitSummary component.
 *
 * These tests verify the main commit display component that
 * composes subject, meta, and view all button.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommitSummary } from "@/components/panes/editor-v2/components/CommitGraph/commit/CommitSummary";
import type { HistoryCommit } from "@/components/panes/editor-v2/components/CommitGraph/types";

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
  const NOW = 1702400000000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Basic Rendering", () => {
    it("should render the component", () => {
      const commit = createCommit({ timestamp: NOW / 1000 - 3600 });
      renderWithProvider(<CommitSummary commit={commit} />);

      expect(screen.getByTestId("commit-summary")).toBeTruthy();
    });

    it("should display the subject", () => {
      const commit = createCommit({
        subject: "Add new feature",
        timestamp: NOW / 1000,
      });
      renderWithProvider(<CommitSummary commit={commit} />);

      expect(screen.getByTestId("commit-subject").textContent).toBe(
        "Add new feature",
      );
    });

    it("should display commit meta information", () => {
      const commit = createCommit({
        timestamp: NOW / 1000 - 7200, // 2 hours ago
        author: "Jane Smith",
        shortId: "xyz9999",
      });
      renderWithProvider(<CommitSummary commit={commit} />);

      expect(screen.getByTestId("commit-meta-time").textContent).toBe("2h ago");
      expect(screen.getByTestId("commit-meta-author").textContent).toBe(
        "Jane Smith",
      );
      expect(screen.getByTestId("commit-meta-hash").textContent).toBe(
        "xyz9999",
      );
    });

    it("should apply custom className", () => {
      const commit = createCommit({ timestamp: NOW / 1000 });
      renderWithProvider(
        <CommitSummary commit={commit} className="custom-class" />,
      );

      expect(
        screen.getByTestId("commit-summary").classList.contains("custom-class"),
      ).toBe(true);
    });
  });

  describe("HEAD Badge", () => {
    it("should not show HEAD badge by default", () => {
      const commit = createCommit({ timestamp: NOW / 1000 });
      renderWithProvider(<CommitSummary commit={commit} />);

      expect(screen.queryByTestId("head-badge")).toBeNull();
    });

    it("should show HEAD badge when isHead is true", () => {
      const commit = createCommit({ timestamp: NOW / 1000 });
      renderWithProvider(<CommitSummary commit={commit} isHead />);

      expect(screen.getByTestId("head-badge").textContent).toBe("HEAD");
    });

    it("should not show HEAD badge when isHead is false", () => {
      const commit = createCommit({ timestamp: NOW / 1000 });
      renderWithProvider(<CommitSummary commit={commit} isHead={false} />);

      expect(screen.queryByTestId("head-badge")).toBeNull();
    });
  });

  describe("View All Button", () => {
    it("should not show view all button when onViewAll is not provided", () => {
      const commit = createCommit({ timestamp: NOW / 1000 });
      renderWithProvider(<CommitSummary commit={commit} />);

      expect(screen.queryByTestId("view-all-button")).toBeNull();
    });

    it("should show view all button when onViewAll is provided", () => {
      const commit = createCommit({ timestamp: NOW / 1000 });
      const onViewAll = vi.fn();
      renderWithProvider(
        <CommitSummary commit={commit} onViewAll={onViewAll} />,
      );

      expect(screen.getByTestId("view-all-button")).toBeTruthy();
    });

    it("should call onViewAll when button is clicked", () => {
      const commit = createCommit({ timestamp: NOW / 1000 });
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
        timestamp: NOW / 1000 - 86400,
        author: "Developer",
        shortId: "fix1234",
      });
      const onViewAll = vi.fn();

      renderWithProvider(
        <CommitSummary commit={commit} isHead onViewAll={onViewAll} />,
      );

      // Check all elements are present
      expect(screen.getByTestId("head-badge")).toBeTruthy();
      expect(screen.getByTestId("commit-subject").textContent).toBe(
        "Important fix",
      );
      expect(screen.getByTestId("view-all-button")).toBeTruthy();
      expect(screen.getByTestId("commit-meta-time").textContent).toBe("1d ago");
      expect(screen.getByTestId("commit-meta-author").textContent).toBe(
        "Developer",
      );
      expect(screen.getByTestId("commit-meta-hash").textContent).toBe(
        "fix1234",
      );
    });
  });

  describe("Multi-line Messages", () => {
    it("should handle commits with multi-line messages", () => {
      const commit = createCommit({
        subject: "Short subject",
        message: "Short subject\n\nThis is the body of the commit message.",
        timestamp: NOW / 1000,
      });

      renderWithProvider(<CommitSummary commit={commit} />);

      // Subject should only show first line
      expect(screen.getByTestId("commit-subject").textContent).toBe(
        "Short subject",
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle commit with empty subject", () => {
      const commit = createCommit({
        subject: "",
        message: "",
        timestamp: NOW / 1000,
      });

      renderWithProvider(<CommitSummary commit={commit} />);

      expect(screen.getByTestId("commit-summary")).toBeTruthy();
    });

    it("should handle very long subject", () => {
      const longSubject =
        "This is an extremely long commit subject line that goes on and on and probably should be truncated somewhere";
      const commit = createCommit({
        subject: longSubject,
        message: longSubject,
        timestamp: NOW / 1000,
      });

      renderWithProvider(<CommitSummary commit={commit} />);

      expect(screen.getByTestId("commit-subject").textContent).toBe(
        longSubject,
      );
      expect(
        screen.getByTestId("commit-subject").classList.contains("truncate"),
      ).toBe(true);
    });

    it("should handle very long author name", () => {
      const commit = createCommit({
        author: "A Very Long Author Name That Should Be Truncated",
        timestamp: NOW / 1000,
      });

      renderWithProvider(<CommitSummary commit={commit} />);

      // Author element should have truncate class
      expect(
        screen.getByTestId("commit-meta-author").classList.contains("truncate"),
      ).toBe(true);
    });
  });
});
