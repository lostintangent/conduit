/**
 * Tests for the CommitSummary component.
 *
 * These tests verify the compact commit display component that
 * shows subject and author on a single line.
 */

import { describe, it, expect, vi } from "vitest";
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
  describe("Basic Rendering", () => {
    it("should render the component", () => {
      const commit = createCommit();
      renderWithProvider(<CommitSummary commit={commit} />);

      expect(screen.getByTestId("commit-summary")).toBeTruthy();
    });

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

    it("should apply custom className", () => {
      const commit = createCommit();
      renderWithProvider(
        <CommitSummary commit={commit} className="custom-class" />,
      );

      expect(
        screen.getByTestId("commit-summary").classList.contains("custom-class"),
      ).toBe(true);
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

    it("should show view all button when onViewAll is provided", () => {
      const commit = createCommit();
      const onViewAll = vi.fn();
      renderWithProvider(
        <CommitSummary commit={commit} onViewAll={onViewAll} />,
      );

      expect(screen.getByTestId("view-all-button")).toBeTruthy();
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
    it("should handle commit with empty subject", () => {
      const commit = createCommit({
        subject: "",
        message: "",
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
      });

      renderWithProvider(<CommitSummary commit={commit} />);

      // Author element should have truncate class (truncates first before subject)
      expect(
        screen.getByTestId("commit-meta-author").classList.contains("truncate"),
      ).toBe(true);
    });
  });
});
