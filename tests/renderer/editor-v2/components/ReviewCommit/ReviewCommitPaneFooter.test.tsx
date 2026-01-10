// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ReviewCommitPaneFooter } from "../../../../../src/renderer/components/panes/editor-v2/components/ReviewCommit/ReviewCommitPaneFooter";
import { TooltipProvider } from "../../../../../src/renderer/components/ui/tooltip";

// Helper to wrap component with required providers
function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("ReviewCommitPaneFooter", () => {
  beforeEach(() => {
    // Mock Date.now for consistent relative time testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should render file count", () => {
    renderWithProviders(<ReviewCommitPaneFooter fileCount={5} />);

    expect(screen.getByText(/5 files changed/)).toBeDefined();
  });

  it("should use singular 'file' for single file", () => {
    renderWithProviders(<ReviewCommitPaneFooter fileCount={1} />);

    expect(screen.getByText(/1 file changed/)).toBeDefined();
  });

  it("should render author in green", () => {
    renderWithProviders(
      <ReviewCommitPaneFooter fileCount={3} author="Jane Doe" />,
    );

    const authorElement = screen.getByText("Jane Doe");
    expect(authorElement).toBeDefined();
    expect(authorElement.className).toContain("text-green-500");
  });

  it("should render timestamp as relative time", () => {
    // Timestamp 1 day ago (in seconds)
    const oneDayAgo = Math.floor(
      new Date("2024-01-14T12:00:00Z").getTime() / 1000,
    );
    renderWithProviders(
      <ReviewCommitPaneFooter fileCount={3} timestamp={oneDayAgo} />,
    );

    // Should show relative time like "1d" or "1 day ago"
    const footer = screen.getByTestId("commit-footer");
    expect(footer.textContent).toContain("1d");
  });

  it("should render all elements in correct order: author, timestamp, files", () => {
    const timestamp = Math.floor(
      new Date("2024-01-14T12:00:00Z").getTime() / 1000,
    );
    renderWithProviders(
      <ReviewCommitPaneFooter
        fileCount={5}
        author="Jane Doe"
        timestamp={timestamp}
      />,
    );

    const footer = screen.getByTestId("commit-footer");
    const text = footer.textContent ?? "";

    // Verify order by checking positions
    const authorPos = text.indexOf("Jane Doe");
    const filesPos = text.indexOf("5 files changed");

    expect(authorPos).toBeLessThan(filesPos);
    // Author should come before files count
    expect(authorPos).toBeGreaterThanOrEqual(0);
    expect(filesPos).toBeGreaterThan(0);
  });

  it("should show separators between elements", () => {
    const timestamp = Math.floor(
      new Date("2024-01-14T12:00:00Z").getTime() / 1000,
    );
    renderWithProviders(
      <ReviewCommitPaneFooter
        fileCount={5}
        author="Jane Doe"
        timestamp={timestamp}
      />,
    );

    const footer = screen.getByTestId("commit-footer");
    // Should have bullet separators
    expect(footer.textContent).toContain("•");
  });

  it("should handle missing author gracefully", () => {
    const timestamp = Math.floor(
      new Date("2024-01-14T12:00:00Z").getTime() / 1000,
    );
    renderWithProviders(
      <ReviewCommitPaneFooter fileCount={3} timestamp={timestamp} />,
    );

    const footer = screen.getByTestId("commit-footer");
    expect(footer.textContent).toContain("3 files changed");
    expect(footer.textContent).not.toContain("undefined");
  });

  it("should handle missing timestamp gracefully", () => {
    renderWithProviders(
      <ReviewCommitPaneFooter fileCount={3} author="Jane Doe" />,
    );

    const footer = screen.getByTestId("commit-footer");
    expect(footer.textContent).toContain("Jane Doe");
    expect(footer.textContent).toContain("3 files changed");
  });

  it("should only show file count when no author or timestamp provided", () => {
    renderWithProviders(<ReviewCommitPaneFooter fileCount={3} />);

    const footer = screen.getByTestId("commit-footer");
    expect(footer.textContent).toBe("3 files changed");
  });
});
