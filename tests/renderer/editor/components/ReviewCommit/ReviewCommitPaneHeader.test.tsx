// @ts-nocheck
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewCommitPaneHeader } from "../../../../../src/renderer/components/panes/editor/components/ReviewCommit/ReviewCommitPaneHeader";
import { TooltipProvider } from "../../../../../src/renderer/components/ui/tooltip";

// Helper to wrap component with required providers
function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("ReviewCommitPaneHeader", () => {
  it("should render commit short ID", () => {
    renderWithProviders(
      <ReviewCommitPaneHeader
        shortId="abc1234"
        subject="Fix authentication bug"
      />,
    );

    expect(screen.getByText("abc1234")).toBeDefined();
  });

  it("should render commit subject", () => {
    renderWithProviders(
      <ReviewCommitPaneHeader
        shortId="abc1234"
        subject="Fix authentication bug"
      />,
    );

    expect(screen.getByText("Fix authentication bug")).toBeDefined();
  });

  it("should show back button when onClose is provided", () => {
    const onClose = vi.fn();
    renderWithProviders(
      <ReviewCommitPaneHeader
        shortId="abc1234"
        subject="Fix bug"
        onClose={onClose}
      />,
    );

    expect(screen.getByTestId("back-button")).toBeDefined();
  });

  it("should not show back button when onClose is not provided", () => {
    renderWithProviders(
      <ReviewCommitPaneHeader shortId="abc1234" subject="Fix bug" />,
    );

    expect(screen.queryByTestId("back-button")).toBeNull();
  });

  it("should call onClose when back button is clicked", () => {
    const onClose = vi.fn();
    renderWithProviders(
      <ReviewCommitPaneHeader
        shortId="abc1234"
        subject="Fix bug"
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId("back-button"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should render with commit-header test id", () => {
    renderWithProviders(
      <ReviewCommitPaneHeader shortId="abc1234" subject="Fix bug" />,
    );

    expect(screen.getByTestId("commit-header")).toBeDefined();
  });

  it("should truncate long commit subjects", () => {
    const longSubject =
      "This is a very long commit message that should be truncated when displayed in the header because it exceeds reasonable length";
    renderWithProviders(
      <ReviewCommitPaneHeader shortId="abc1234" subject={longSubject} />,
    );

    const subjectElement = screen.getByText(longSubject);
    expect(subjectElement.className).toContain("truncate");
  });

  it("should apply custom className when provided", () => {
    renderWithProviders(
      <ReviewCommitPaneHeader
        shortId="abc1234"
        subject="Fix bug"
        className="custom-class"
      />,
    );

    const header = screen.getByTestId("commit-header");
    expect(header.className).toContain("custom-class");
  });

  it("should have bg-elevated background", () => {
    renderWithProviders(
      <ReviewCommitPaneHeader shortId="abc1234" subject="Fix bug" />,
    );

    const header = screen.getByTestId("commit-header");
    expect(header.className).toContain("bg-elevated");
  });
});
