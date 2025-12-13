/**
 * Tests for the CommitReviewHeader component.
 *
 * These tests verify the display of commit header information:
 * subject, author, date, hash, stats, and back button.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommitReviewHeader } from "@/components/panes/editor-v2/components/CommitReviewPane/CommitReviewHeader";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Wrapper component that provides tooltip context.
 */
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

function renderWithProvider(ui: React.ReactElement) {
  return render(ui, { wrapper: TestWrapper });
}

// =============================================================================
// Tests
// =============================================================================

describe("CommitReviewHeader", () => {
  // Use fixed time for consistent tests
  const NOW = 1702400000000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const defaultProps = {
    subject: "Fix authentication bug",
    shortId: "abc1234",
    fullId: "abc1234567890def",
    author: "John Doe",
    timestamp: NOW / 1000 - 3600, // 1 hour ago
    stats: { filesChanged: 3, additions: 42, deletions: 10 },
  };

  it("should render the component", () => {
    renderWithProvider(<CommitReviewHeader {...defaultProps} />);

    expect(screen.getByTestId("commit-review-header")).toBeTruthy();
  });

  it("should display commit subject", () => {
    renderWithProvider(<CommitReviewHeader {...defaultProps} />);

    expect(screen.getByTestId("commit-subject").textContent).toBe(
      "Fix authentication bug",
    );
  });

  it("should display author name", () => {
    renderWithProvider(
      <CommitReviewHeader {...defaultProps} author="Jane Smith" />,
    );

    expect(screen.getByTestId("commit-author").textContent).toBe("Jane Smith");
  });

  it("should display short commit hash", () => {
    renderWithProvider(<CommitReviewHeader {...defaultProps} />);

    expect(screen.getByTestId("commit-hash").textContent).toBe("abc1234");
  });

  it("should display relative date", () => {
    renderWithProvider(<CommitReviewHeader {...defaultProps} />);

    // Should show "today" for 1 hour ago
    expect(screen.getByTestId("commit-date").textContent).toContain("today");
  });

  it("should display stats when provided", () => {
    renderWithProvider(<CommitReviewHeader {...defaultProps} />);

    const stats = screen.getByTestId("commit-stats");
    expect(stats.textContent).toContain("3 files");
    expect(stats.textContent).toContain("+42");
    expect(stats.textContent).toContain("-10");
  });

  it("should show back button when onBack is provided", () => {
    const onBack = vi.fn();
    renderWithProvider(
      <CommitReviewHeader {...defaultProps} onBack={onBack} />,
    );

    const backButton = screen.getByRole("button", { name: /back/i });
    expect(backButton).toBeTruthy();

    fireEvent.click(backButton);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("should hide back button when onBack is not provided", () => {
    renderWithProvider(<CommitReviewHeader {...defaultProps} />);

    expect(screen.queryByRole("button", { name: /back/i })).toBeFalsy();
  });

  it("should display read-only indicator", () => {
    renderWithProvider(<CommitReviewHeader {...defaultProps} />);

    expect(screen.getByText("Read-only")).toBeTruthy();
  });

  it("should handle stats with singular file", () => {
    renderWithProvider(
      <CommitReviewHeader
        {...defaultProps}
        stats={{ filesChanged: 1, additions: 5, deletions: 2 }}
      />,
    );

    const stats = screen.getByTestId("commit-stats");
    expect(stats.textContent).toContain("1 file");
  });

  it("should handle stats with zero values", () => {
    renderWithProvider(
      <CommitReviewHeader
        {...defaultProps}
        stats={{ filesChanged: 2, additions: 0, deletions: 0 }}
      />,
    );

    const stats = screen.getByTestId("commit-stats");
    expect(stats.textContent).toContain("2 files");
  });
});
