/**
 * Tests for the CommitMeta component.
 *
 * These tests verify the display of commit metadata:
 * relative time, author, and short hash.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommitMeta } from "@/components/panes/editor-v2/components/CommitGraph/commit/CommitMeta";

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

describe("CommitMeta", () => {
  // Use fixed time for consistent tests
  const NOW = 1702400000000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should render the component", () => {
    renderWithProvider(
      <CommitMeta
        timestamp={NOW / 1000 - 3600}
        author="John Doe"
        shortId="abc1234"
      />,
    );

    expect(screen.getByTestId("commit-meta")).toBeTruthy();
  });

  it("should display relative time", () => {
    renderWithProvider(
      <CommitMeta
        timestamp={NOW / 1000 - 3600} // 1 hour ago
        author="John Doe"
        shortId="abc1234"
      />,
    );

    expect(screen.getByTestId("commit-meta-time").textContent).toBe("1h");
  });

  it("should display author name", () => {
    renderWithProvider(
      <CommitMeta
        timestamp={NOW / 1000}
        author="Jane Smith"
        shortId="abc1234"
      />,
    );

    expect(screen.getByTestId("commit-meta-author").textContent).toBe(
      "Jane Smith",
    );
  });

  it("should display short hash in monospace", () => {
    renderWithProvider(
      <CommitMeta timestamp={NOW / 1000} author="John Doe" shortId="def5678" />,
    );

    const hashElement = screen.getByTestId("commit-meta-hash");
    expect(hashElement.textContent).toBe("def5678");
    expect(hashElement.classList.contains("font-mono")).toBe(true);
  });

  it("should display all three parts with separators", () => {
    renderWithProvider(
      <CommitMeta
        timestamp={NOW / 1000 - 86400} // 1 day ago
        author="Alice"
        shortId="xyz9999"
      />,
    );

    const container = screen.getByTestId("commit-meta");
    expect(container.textContent).toContain("1d");
    expect(container.textContent).toContain("·");
    expect(container.textContent).toContain("Alice");
    expect(container.textContent).toContain("xyz9999");
  });

  it("should apply custom className", () => {
    renderWithProvider(
      <CommitMeta
        timestamp={NOW / 1000}
        author="John Doe"
        shortId="abc1234"
        className="custom-class"
      />,
    );

    expect(
      screen.getByTestId("commit-meta").classList.contains("custom-class"),
    ).toBe(true);
  });

  it("should have author title for truncation", () => {
    const longName = "A Very Long Author Name That Might Get Truncated";
    renderWithProvider(
      <CommitMeta timestamp={NOW / 1000} author={longName} shortId="abc1234" />,
    );

    expect(screen.getByTestId("commit-meta-author").getAttribute("title")).toBe(
      longName,
    );
  });

  it("should handle recent time in seconds", () => {
    renderWithProvider(
      <CommitMeta
        timestamp={NOW / 1000 - 5} // 5 seconds ago
        author="John Doe"
        shortId="abc1234"
      />,
    );

    expect(screen.getByTestId("commit-meta-time").textContent).toBe("5s");
  });
});
